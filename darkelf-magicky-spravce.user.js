// ==UserScript==
// @name         Dark Elf - Magický správce
// @namespace    https://github.com/goringardevang-alt/darkelf-magicky-spravce
// @version      0.95
// @description  Magic list pro darkelf.cz: přečte ho, zkontroluje MO a šance podle tvé SK, naloží dávku do kouzlení, spočítá manu a hlídá, co se doopravdy seslalo. Vše v jednom souboru.
// @author       Gorin & Claude Opus 5 (základ: Noxtrip)
// @match        *://*.darkelf.cz/*
// @grant        none
// @homepageURL  https://github.com/goringardevang-alt/darkelf-magicky-spravce
// @supportURL   https://github.com/goringardevang-alt/darkelf-magicky-spravce/issues
// @updateURL    https://raw.githubusercontent.com/goringardevang-alt/darkelf-magicky-spravce/main/darkelf-magicky-spravce.user.js
// @downloadURL  https://raw.githubusercontent.com/goringardevang-alt/darkelf-magicky-spravce/main/darkelf-magicky-spravce.user.js
// ==/UserScript==

// ─────────────────────────────────────────────────────────────
// Dark Elf - Magický správce v0.95   (Core Utils v2.29 uvnitř)
//
// Základ: magický skript od Noxtripa.
// Přepsal a rozšířil Claude Opus 5 ve spolupráci s Gorinem.
//
// Sestavený soubor — needituj ho, po aktualizaci by se změny ztratily.
// Chyba nebo nápad: https://github.com/goringardevang-alt/darkelf-magicky-spravce/issues
// ─────────────────────────────────────────────────────────────

if (!window.DarkElfUtils) {
(function() {
    'use strict';

    window.DarkElfUtils = {
        VERSION: '2.29',

        getLeague: function() {
            const isValid = (val) => val && val !== '0' && val.toLowerCase() !== 'default' && val !== '';

            let apiLeague = localStorage.getItem("de_league_api");
            if (isValid(apiLeague)) return apiLeague.toUpperCase();

            let m = window.location.href.match(/[?&](?:l|liga)=([^&]+)/i);
            if (m && isValid(m[1])) return m[1].toUpperCase();

            let hMatch = window.location.host.match(/^([a-z0-9]+)\.darkelf\.cz/i);
            if (hMatch && isValid(hMatch[1]) && hMatch[1].toLowerCase() !== 'www') return hMatch[1].toUpperCase();

            try {
                let b = document.body;
                if (b) {
                    let onload = b.getAttribute('onload') || '';
                    let mOnload = onload.match(/mapStart\(['"](.+?)['"]\)/);
                    if (mOnload && isValid(mOnload[1])) return mOnload[1].toUpperCase();

                    let mText = b.innerHTML.match(/Liga\s+([A-Z0-9]{1,4})(?:[,\s<]|$)/i);
                    if (mText && isValid(mText[1])) return mText[1].toUpperCase();
                }
            } catch(e) {}

            let fallback = localStorage.getItem("de_last_known_league");
            if (isValid(fallback)) return fallback.toUpperCase();

            return 'DEFAULT';
        },

        fetchPage: async function(url, ttlSekund) {
            const klicCache = 'de_fetch:' + url;
            if (ttlSekund) {
                try {
                    const raw = sessionStorage.getItem(klicCache);
                    const ulozene = raw ? JSON.parse(raw) : null;
                    if (ulozene && (Date.now() - ulozene.t) < ttlSekund * 1000) {
                        const konecCache = window.DarkElfUtils.Mereni.usek('z cache ' + url);
                        const doc = new DOMParser().parseFromString(ulozene.html, 'text/html');
                        konecCache();
                        return doc;
                    }
                } catch (e) {  }
            }
            window.DarkElfUtils.Net.start(url);
            const konecMereni = window.DarkElfUtils.Mereni.usek('fetch ' + url);
            try {
                const res = await fetch(url, { credentials: 'include' });
                const buffer = await res.arrayBuffer();
                const text = new TextDecoder('windows-1250').decode(buffer);

                if (ttlSekund && text.length < 2000000) {
                    try { sessionStorage.setItem(klicCache, JSON.stringify({ t: Date.now(), html: text })); }
                    catch (e) {  }
                }
                return new DOMParser().parseFromString(text, 'text/html');
            } catch (e) {
                console.error("DarkElfUtils.fetchPage error:", e);
                return null;
            } finally {
                konecMereni();
                window.DarkElfUtils.Net.end();
            }
        },

        injectCSS: function(cssString, id = 'de-custom-styles') {
            if (!document.getElementById(id)) {
                let style = document.createElement('style');
                style.id = id;
                style.innerHTML = cssString;
                document.head.appendChild(style);
            }
        },

        Cache: {
            _getMidnight: function() {
                let d = new Date();
                d.setHours(24, 0, 0, 0);
                return d.getTime();
            },
            _buildKey: function(namespace, identifier) {
                const league = window.DarkElfUtils.getLeague() || 'ALL';
                return `DE_CACHE_${league}_${namespace}_${identifier}`;
            },
            set: function(namespace, identifier, value, expiresAt) {
                const key = this._buildKey(namespace, identifier);
                if (value === null || value === undefined) {
                    localStorage.removeItem(key);
                } else {
                    const payload = {
                        data: value,
                        expires: expiresAt || this._getMidnight()
                    };
                    localStorage.setItem(key, JSON.stringify(payload));
                }
            },
            get: function(namespace, identifier) {
                const key = this._buildKey(namespace, identifier);
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                try {
                    const payload = JSON.parse(raw);
                    if (payload && payload.expires) {
                        if (Date.now() > payload.expires) {
                            localStorage.removeItem(key);
                            return null;
                        }
                        return payload.data;
                    }
                    return payload.data !== undefined ? payload.data : payload;
                } catch (e) {
                    return null;
                }
            }
        },

        Races: {
            0:  { key: 'men',          cz: 'Lidé',         baseTurns: 8  },
            1:  { key: 'barbarians',   cz: 'Barbaři',      baseTurns: 7  },
            2:  { key: 'orcs',         cz: 'Skřeti',       baseTurns: 10 },
            3:  { key: 'uruks',        cz: 'Skuruti',      baseTurns: 9  },
            4:  { key: 'necromancers', cz: 'Nekromanti',   baseTurns: 8  },
            5:  { key: 'magi',         cz: 'Mágové',       baseTurns: 7  },
            6:  { key: 'elves',        cz: 'Elfové',       baseTurns: 7  },
            7:  { key: 'dark elves',   cz: 'Temní elfové', baseTurns: 6  },
            8:  { key: 'dwarves',      cz: 'Trpaslíci',    baseTurns: 6  },
            9:  { key: 'hobbits',      cz: 'Hobiti',       baseTurns: 11 },
            10: { key: 'ents',         cz: 'Enti',         baseTurns: 5  },

            byId:  function(id) { return this[id] || null; },
            byKey: function(key) {
                for (let id in this) {
                    if (typeof this[id] === 'object' && this[id].key === key) return { id: parseInt(id), ...this[id] };
                }
                return null;
            },
            byCz:  function(name) {
                if (!name) return null;
                name = name.toLowerCase();
                for (let id in this) {
                    if (typeof this[id] === 'object' && this[id].cz.toLowerCase() === name) return { id: parseInt(id), ...this[id] };
                }
                return null;
            }
        },

        UnitStats: {
            "men":          { 1: { attack: 1, defence: 5 }, 2: { attack: 7, defence: 3 }, 3: { attack: 4, defence: 4 } },
            "barbarians":   { 1: { attack: 4, defence: 3 }, 2: { attack: 9, defence: 3 }, 3: { attack: 5, defence: 4 } },
            "orcs":         { 1: { attack: 2, defence: 4 }, 2: { attack: 5, defence: 3 }, 3: { attack: 3, defence: 3 } },
            "uruks":        { 1: { attack: 3, defence: 3 }, 2: { attack: 7, defence: 1 }, 3: { attack: 5, defence: 3 } },
            "necromancers": { 1: { attack: 1, defence: 4 }, 2: { attack: 7, defence: 2 }, 3: { attack: 5, defence: 3 } },
            "magi":         { 1: { attack: 2, defence: 5 }, 2: { attack: 7, defence: 2 }, 3: { attack: 3, defence: 5 } },
            "elves":        { 1: { attack: 2, defence: 6 }, 2: { attack: 6, defence: 4 }, 3: { attack: 5, defence: 5 } },
            "dark elves":   { 1: { attack: 3, defence: 5 }, 2: { attack: 8, defence: 3 }, 3: { attack: 4, defence: 5 } },
            "dwarves":      { 1: { attack: 2, defence: 7 }, 2: { attack: 5, defence: 6 }, 3: { attack: 3, defence: 7 } },
            "hobbits":      { 1: { attack: 2, defence: 2 }, 2: { attack: 4, defence: 2 }, 3: { attack: 1, defence: 2 } },
            "ents":         { 1: { attack: 4, defence: 6 }, 2: { attack: 8, defence: 8 }, 3: { attack: 3, defence: 6 } }
        },

        FortressMap: {
            'p2': { key: 'wooden_walls',     cz: 'Dřevěné hradby',  bonus: [1, 1.1]  },
            'p3': { key: 'small_fortress',   cz: 'Malá pevnost',    bonus: [1.1, 1.2] },
            'p4': { key: 'medium_fortress',  cz: 'Střední pevnost', bonus: [1.25, 1.5] },
            'p5': { key: 'large_fortress',   cz: 'Velká pevnost',   bonus: [1.5, 2]   }
        },

        TowerMap: {
            'm2': { key: 'shrine',        cz: 'Obřadní svatyně',       magAdd: 5,  magMul: 1   },
            'm3': { key: 'small_tower',   cz: 'Malá magická věž',      magAdd: 20, magMul: 1   },
            'm4': { key: 'medium_tower',  cz: 'Střední magická věž',   magAdd: 0,  magMul: 1.5 },
            'm5': { key: 'large_tower',   cz: 'Velká magická věž',     magAdd: 0,  magMul: 2.0 },
            'm6': { key: 'defense_tower', cz: 'Obranná magická věž',   magAdd: 50, magMul: 1   },
            'm7': { key: 'temple',        cz: 'Chrám',                 magAdd: 0,  magMul: 4.0 }
        },

        _extractImgSuffix: function(imgStr) {
            if (!imgStr) return null;
            const match = imgStr.match(/([vpm]\d+)\.gif/i);
            return match ? match[1] : null;
        },

        parseFortress: function(imgPevnost) {
            const suffix = this._extractImgSuffix(imgPevnost);
            return suffix ? (this.FortressMap[suffix] || null) : null;
        },

        parseTower: function(imgVez) {
            const suffix = this._extractImgSuffix(imgVez);
            return suffix ? (this.TowerMap[suffix] || null) : null;
        },

        MapAPI: {
            _lastFetchTime: 0,
            _MIN_INTERVAL_MS: 120000,
            _RATE_LIMIT_MS: 6000,

            fetch: async function(area, force) {
                const now = Date.now();
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');

                if (!force && cached && cached._fetchedAt && (now - cached._fetchedAt) < this._MIN_INTERVAL_MS) {
                    return cached;
                }

                if ((now - this._lastFetchTime) < this._RATE_LIMIT_MS) {
                    console.warn('DarkElfUtils.MapAPI: Rate limit, vracím cache');
                    return cached || null;
                }

                const url = area != null ? `/map_export_json.asp?area=${area}` : '/map_export_json.asp';
                window.DarkElfUtils.Net.start(url);
                const konecMereni = window.DarkElfUtils.Mereni.usek('fetch ' + url);
                try {
                    const resp = await fetch(url, { credentials: 'include' });
                    const data = await resp.json();

                    if (data.error) {
                        console.warn('DarkElfUtils.MapAPI:', data.error, 'retry_after:', data.retry_after);
                        return cached || null;
                    }

                    data._fetchedAt = now;
                    this._lastFetchTime = now;

                    if (data.hlavicka && data.hlavicka.liga != null && data.hlavicka.liga !== '') {
                        localStorage.setItem('de_league_api', String(data.hlavicka.liga));
                    }

                    window.DarkElfUtils.Cache.set('api', 'map_json', data);
                    return data;
                } catch(e) {
                    console.error('DarkElfUtils.MapAPI.fetch:', e);
                    return cached || null;
                } finally {
                    konecMereni();
                    window.DarkElfUtils.Net.end();
                }
            },

            getCountry: function(countryId) {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                if (!cached || !cached.zeme) return null;
                const id = parseInt(countryId, 10);
                return cached.zeme.find(z => z.id === id) || null;
            },

            getHeader: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                return cached ? cached.hlavicka : null;
            },

            getPrivate: function(countryId) {
                const country = this.getCountry(countryId);
                return country ? country.private : null;
            },

            getRace: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.Races.byId(country.id_rasa);
            },

            getMyRace: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                const hlavicka = cached && cached.hlavicka;
                if (!hlavicka || !Array.isArray(cached.zeme)) return null;

                const mojeId = String(hlavicka.id_hrace == null ? '' : hlavicka.id_hrace);
                const mojeJmeno = hlavicka.hrac || null;

                for (const z of cached.zeme) {
                    const sedi = (mojeId && String(z.id_hrac) === mojeId)
                        || (!mojeId && mojeJmeno && z.hrac === mojeJmeno);
                    if (sedi && z.id_rasa != null) {
                        return window.DarkElfUtils.Races.byId(z.id_rasa);
                    }
                }
                return null;
            },

            getFortress: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.parseFortress(country.img_pevnost);
            },

            getTower: function(countryId) {
                const country = this.getCountry(countryId);
                if (!country) return null;
                return window.DarkElfUtils.parseTower(country.img_vez);
            },

            isStale: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
                if (!cached || !cached._fetchedAt) return true;
                return (Date.now() - cached._fetchedAt) >= this._MIN_INTERVAL_MS;
            }
        },

        TreatiesAPI: {
            _lastFetchTime: 0,
            _MIN_INTERVAL_MS: 120000,
            _RATE_LIMIT_MS: 6000,

            TreatyTypes: {
                1: { cz: 'Vojenská',      key: 'military' },
                2: { cz: 'Magická',       key: 'magic' },
                3: { cz: 'Obchodní',      key: 'trade' },
                4: { cz: 'Volný průchod', key: 'passage' },
                5: { cz: 'Zrušena',       key: 'cancelled' },
                6: { cz: 'Válka',         key: 'war' },
                7: { cz: 'Mír',           key: 'peace' }
            },
            TREATY_MILITARY: 1,
            TREATY_WAR: 6,

            fetch: async function(force) {
                const now = Date.now();
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');

                if (!force && cached && cached._fetchedAt && (now - cached._fetchedAt) < this._MIN_INTERVAL_MS) {
                    return cached;
                }

                if ((now - this._lastFetchTime) < this._RATE_LIMIT_MS) {
                    console.warn('DarkElfUtils.TreatiesAPI: Rate limit, vracím cache');
                    return cached || null;
                }

                window.DarkElfUtils.Net.start('/smlouvy_export_json.asp');
                const konecMereni = window.DarkElfUtils.Mereni.usek('fetch /smlouvy_export_json.asp');
                try {
                    const resp = await fetch('/smlouvy_export_json.asp', { credentials: 'include' });
                    const data = await resp.json();

                    if (data.error) {
                        console.warn('DarkElfUtils.TreatiesAPI:', data.error);
                        return cached || null;
                    }

                    data._fetchedAt = now;
                    this._lastFetchTime = now;
                    window.DarkElfUtils.Cache.set('api', 'treaties_json', data);
                    return data;
                } catch(e) {
                    console.error('DarkElfUtils.TreatiesAPI.fetch:', e);
                    return cached || null;
                } finally {
                    konecMereni();
                    window.DarkElfUtils.Net.end();
                }
            },

            getCountry: function(countryId) {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                if (!cached || !cached.smlouvy) return null;
                const id = parseInt(countryId, 10);
                return cached.smlouvy.find(s => s.id === id) || null;
            },

            getHeader: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                return cached ? cached.hlavicka : null;
            },

            getNeighbors: function(countryId) {
                const entry = this.getCountry(countryId);
                if (!entry) return [];
                const neighbors = [];
                for (let i = 1; i <= 10; i++) {
                    const val = entry['s' + i];
                    if (val != null) neighbors.push(val);
                }
                return neighbors;
            },

            getExpiring: function(countryId) {
                const out = new Map();
                const entry = this.getCountry(countryId);
                if (!entry || !entry.private) return out;

                for (let i = 1; i <= 10; i++) {
                    const neighborId = entry['s' + i];
                    if (neighborId == null) continue;
                    const expiring = entry.private['d' + i];
                    if (expiring == null || expiring === 0) continue;
                    if (expiring === entry.private['sm' + i]) continue;
                    out.set(neighborId, expiring);
                }
                return out;
            },

            getMilitaryAllianceDefence: function(countryId) {
                const entry = this.getCountry(countryId);
                if (!entry || !entry.private) return 0;

                let totalPower = 0;
                for (let i = 1; i <= 10; i++) {
                    const treatyType = entry.private['sm' + i];
                    const neighborId = entry['s' + i];

                    if (treatyType === window.DarkElfUtils.TreatiesAPI.TREATY_MILITARY && neighborId != null) {

                        const ally = window.DarkElfUtils.MapAPI.getCountry(neighborId);
                        if (ally) {
                            totalPower += ally.land_power || 0;
                        }
                    }
                }
                return totalPower;
            },

            isStale: function() {
                const cached = window.DarkElfUtils.Cache.get('api', 'treaties_json');
                if (!cached || !cached._fetchedAt) return true;
                return (Date.now() - cached._fetchedAt) >= this._MIN_INTERVAL_MS;
            }
        }
    };

    window.DarkElfUtils.AllianceAPI = {

        DONOR_IDS: [6, 7, 8, 10],

        DISCOUNT_CATS: {
            spells:   { native: 6,  base: 20, capNative: 40, capOther: 30 },
            towers:   { native: 7,  base: 10, capNative: 30, capOther: 20 },
            fortify:  { native: 8,  base: 20, capNative: 40, capOther: 30 },
            timewarp: { native: 10, base: 20, capNative: 40, capOther: 30 }
        },

        _registryKey: function() {
            return 'de_alliance_races_' + (window.DarkElfUtils.getLeague() || 'ALL');
        },
        _getRegistry: function() {
            try { return JSON.parse(localStorage.getItem(this._registryKey())) || {}; }
            catch(e) { return {}; }
        },
        _registryDayKey: function() {
            return this._registryKey() + '_den';
        },

        _updateRegistry: function(zeme, den) {
            if (!Array.isArray(zeme)) return;
            let reg = this._getRegistry();

            den = parseInt(den, 10);
            if (Number.isInteger(den)) {
                const prev = parseInt(localStorage.getItem(this._registryDayKey()), 10);
                if (Number.isInteger(prev) && den < prev) {
                    reg = {};
                    try { localStorage.removeItem(this._registryKey()); } catch(e) {}
                }
                try { localStorage.setItem(this._registryDayKey(), String(den)); } catch(e) {}
            }

            let changed = false;
            zeme.forEach(z => {
                const name = z.hrac;
                const idRasa = parseInt(z.id_rasa, 10);
                if (name && Number.isInteger(idRasa) && reg[name] !== idRasa) {
                    reg[name] = idRasa; changed = true;
                }
            });
            if (changed) {
                try { localStorage.setItem(this._registryKey(), JSON.stringify(reg)); } catch(e) {}
            }
        },

        _fetchRoster: async function(force) {
            if (!force) {
                const c = window.DarkElfUtils.Cache.get('api', 'alliance_roster');
                if (c) return c;
            }
            try {
                const doc = await window.DarkElfUtils.fetchPage('/aliance.asp');
                if (!doc) return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
                const names = [];
                doc.querySelectorAll('#tab_players_list tr').forEach(row => {
                    const a = row.querySelector('th a[target="mail"]');
                    if (!a) return;
                    const n = (a.textContent || '').replace(/\s+/g, ' ').trim();
                    if (n) names.push(n);
                });
                if (names.length === 0) return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
                window.DarkElfUtils.Cache.set('api', 'alliance_roster', names);
                return names;
            } catch(e) {
                console.warn('DarkElfUtils.AllianceAPI._fetchRoster:', e.message);
                return window.DarkElfUtils.Cache.get('api', 'alliance_roster') || null;
            }
        },
        _getRoster: function() {
            return window.DarkElfUtils.Cache.get('api', 'alliance_roster');
        },

        fetch: async function(force) {
            const map = await window.DarkElfUtils.MapAPI.fetch(null, force);
            if (map && map.zeme) this._updateRegistry(map.zeme, map.hlavicka && map.hlavicka.den);
            await this._fetchRoster(force);
            return this.getMembers();
        },

        getMembers: function() {
            const header = window.DarkElfUtils.MapAPI.getHeader();
            const cached = window.DarkElfUtils.Cache.get('api', 'map_json');
            if (!header || !cached || !cached.zeme) return [];
            const myAli = parseInt(header.id_aliance, 10);
            if (!myAli) return [];

            const byName = {};

            cached.zeme.forEach(z => {
                if (parseInt(z.id_aliance, 10) !== myAli) return;
                const name = z.hrac;
                const idRasa = parseInt(z.id_rasa, 10);
                if (!name || !Number.isInteger(idRasa)) return;
                byName[name] = {
                    hrac: name,
                    id_rasa: idRasa,
                    race: window.DarkElfUtils.Races.byId(idRasa),
                    landless: false
                };
            });

            const roster = this._getRoster();
            if (Array.isArray(roster)) {
                const registry = this._getRegistry();
                roster.forEach(name => {
                    if (byName[name]) return;
                    const idRasa = registry[name];
                    if (!Number.isInteger(idRasa)) return;
                    byName[name] = {
                        hrac: name,
                        id_rasa: idRasa,
                        race: window.DarkElfUtils.Races.byId(idRasa),
                        landless: true
                    };
                });
            }
            return Object.values(byName);
        },

        getRaceCounts: function() {
            const members = this.getMembers();
            const byId = {};
            let donorTotal = 0, malokoloveCount = 0;
            members.forEach(m => {
                byId[m.id_rasa] = (byId[m.id_rasa] || 0) + 1;
                if (this.DONOR_IDS.includes(m.id_rasa)) donorTotal++;
                if (m.race && m.race.baseTurns <= 7) malokoloveCount++;
            });
            return { byId, donorTotal, malokoloveCount, total: members.length };
        },

        getDiscount: function(raceId, catKey) {
            const cat = this.DISCOUNT_CATS[catKey];
            if (!cat) { console.warn('DarkElfUtils.AllianceAPI.getDiscount: neznámá kategorie', catKey); return 0; }

            raceId = parseInt(raceId, 10);
            const race = window.DarkElfUtils.Races.byId(raceId);
            if (!race || race.baseTurns > 7) return 0;

            const counts = this.getRaceCounts();
            if ((counts.byId[cat.native] || 0) === 0) return 0;

            const isDonor  = this.DONOR_IDS.includes(raceId);
            const isNative = raceId === cat.native;
            const bonus = (counts.donorTotal - (isDonor ? 1 : 0)) * 5;
            const base  = isNative ? cat.base : 0;
            const cap   = isNative ? cat.capNative : cat.capOther;
            return Math.min(base + bonus, cap);
        },

        isStale: function() {
            return window.DarkElfUtils.MapAPI.isStale();
        }
    };

    window.DarkElfUtils.RoundsAPI = {
        _LS_KEY: 'de_rounds_remaining',

        save: function() {
            const el = document.getElementById('i3');
            if (!el) return null;
            const text = (el.innerHTML || el.textContent || '').replace(/&nbsp;/ig, '').replace(/\s+/g, '');
            const match = text.match(/(\d+)\/(\d+)/);
            if (!match) return null;
            const remaining = parseInt(match[2], 10) - parseInt(match[1], 10);
            localStorage.setItem(this._LS_KEY, remaining);
            return remaining;
        },

        get: function() {
            try {
                if (window.parent && window.parent.frames) {
                    for (let i = 0; i < window.parent.frames.length; i++) {
                        try {
                            const doc = window.parent.frames[i].document;
                            const el = doc && doc.getElementById('i3');
                            if (!el) continue;
                            const text = (el.innerHTML || el.textContent || '').replace(/&nbsp;/ig, '').replace(/\s+/g, '');
                            const match = text.match(/(\d+)\/(\d+)/);
                            if (match) return parseInt(match[2], 10) - parseInt(match[1], 10);
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            const saved = localStorage.getItem(this._LS_KEY);
            return saved !== null ? parseInt(saved, 10) : null;
        }
    };

    window.DarkElfUtils.Mereni = {
        KLIC: 'de_mereni',
        KLIC_LOG: 'de_mereni_log',
        MAX_RADKU: 300,
        _on: null,
        _zaznamy: [],
        _timer: null,

        zapnuto: function() {
            if (this._on === null) {
                try { this._on = (localStorage.getItem(this.KLIC) === '1'); }
                catch (e) { this._on = false; }
            }
            return this._on;
        },

        usek: function(nazev) {
            if (!this.zapnuto()) return function() {};
            const t0 = performance.now();
            const self = this;
            return function() { self._pridej(nazev, performance.now() - t0); };
        },

        _pridej: function(nazev, ms) {
            this._zaznamy.push({ nazev: nazev, ms: Math.round(ms) });

            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(this.vypis.bind(this), 2000);
        },

        _kde: function() {
            try { return (location.pathname.split('/').pop() || 'index') + location.search; }
            catch (e) { return '?'; }
        },

        vypis: function() {
            this._timer = null;
            if (!this._zaznamy.length) return;
            let celkem = 0;
            this._zaznamy.forEach(z => { celkem += z.ms; });
            const hlavicka = '[DE měření] ' + this._kde() + ' — součet úseků ' + celkem + ' ms';
            const radky = this._zaznamy.map(z => '    ' + String(z.ms).padStart(6) + ' ms  ' + z.nazev);
            console.log([hlavicka].concat(radky).join('\n'));
            try {
                const cas = new Date().toLocaleTimeString('cs-CZ');
                const stary = (localStorage.getItem(this.KLIC_LOG) || '').split('\n').filter(Boolean);
                const nove = stary.concat([cas + ' ' + hlavicka]).concat(radky);
                localStorage.setItem(this.KLIC_LOG, nove.slice(-this.MAX_RADKU).join('\n'));
            } catch (e) {  }
            this._zaznamy = [];
        }
    };

    window.DarkElfUtils.Net = {
        _count: 0,
        _hideTimer: null,

        _el: function() {
            if (!document.body) return null;
            let el = document.getElementById('de-net-indicator');
            if (!el) {
                el = document.createElement('div');
                el.id = 'de-net-indicator';
                el.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:2147483647;'
                    + 'background:rgba(20,10,0,0.92);border:1px solid #b8860b;border-radius:4px;'
                    + 'color:#ffcc44;font:bold 11px sans-serif;padding:4px 8px;pointer-events:none;'
                    + 'box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap;display:none;';
                document.body.appendChild(el);
            }
            return el;
        },

        start: function(label) {
            this._count++;
            if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
            const el = this._el();
            if (!el) return;
            el.textContent = '⏳ Načítám data…' + (this._count > 1 ? ' (' + this._count + ')' : '');
            el.title = 'Skript stahuje herní data. Počkej s klikáním na akce v zemích.'
                + (label ? '\n' + label : '');
            el.style.display = 'block';
        },

        end: function() {
            this._count = Math.max(0, this._count - 1);
            const el = this._el();
            if (!el) return;
            if (this._count > 0) {
                el.textContent = '⏳ Načítám data…' + (this._count > 1 ? ' (' + this._count + ')' : '');
                return;
            }

            this._hideTimer = setTimeout(() => {
                if (this._count === 0) el.style.display = 'none';
            }, 250);
        }
    };

    window.DarkElfUtils.RoundGuard = {
        _LS_KEY: 'de_round_guard',
        _TTL_MS: 6 * 60 * 60 * 1000,

        _league: function() {
            try { return window.DarkElfUtils.getLeague() || 'ALL'; } catch(e) { return 'ALL'; }
        },

        _currentDay: function() {
            try {
                const h = window.DarkElfUtils.MapAPI.getHeader();
                return h && h.den != null ? parseInt(h.den, 10) : null;
            } catch(e) { return null; }
        },

        _readAll: function() {
            try { return JSON.parse(localStorage.getItem(this._LS_KEY)) || {}; }
            catch(e) { return {}; }
        },

        _writeAll: function(obj) {
            try { localStorage.setItem(this._LS_KEY, JSON.stringify(obj)); } catch(e) {}
        },

        set: function(key, opts) {
            if (!key) return;
            opts = opts || {};
            const all = this._readAll();
            const lg = this._league();
            if (!all[lg]) all[lg] = {};
            all[lg][key] = {
                label: opts.label || key,
                level: opts.level || 'warn',
                message: opts.message || '',
                day: this._currentDay(),
                ts: Date.now()
            };
            this._writeAll(all);
        },

        clear: function(key) {
            const all = this._readAll();
            const lg = this._league();
            if (all[lg] && all[lg][key]) {
                delete all[lg][key];
                if (Object.keys(all[lg]).length === 0) delete all[lg];
                this._writeAll(all);
            }
        },

        list: function() {
            const all = this._readAll();
            const lg = this._league();
            const bucket = all[lg];
            if (!bucket) return [];
            const day = this._currentDay();
            const now = Date.now();
            const out = [];
            let changed = false;
            for (const key in bucket) {
                const rec = bucket[key];
                const staleDay = (day != null && rec.day != null && rec.day !== day);
                const staleTtl = (rec.ts != null && (now - rec.ts) > this._TTL_MS);
                if (staleDay || staleTtl) { delete bucket[key]; changed = true; continue; }
                out.push(Object.assign({ key: key }, rec));
            }
            if (changed) {
                if (Object.keys(bucket).length === 0) delete all[lg];
                this._writeAll(all);
            }
            return out;
        },

        check: function() {
            const recs = this.list();
            if (recs.length === 0) return null;
            const hasBlock = recs.some(r => r.level === 'block');
            const labels = recs.map(r => r.label);
            const messages = recs.map(r => r.message).filter(Boolean);
            return {
                level: hasBlock ? 'block' : 'warn',
                labels: labels,
                text: labels.map(l => l + '!').join(' '),
                message: messages.join(' ')
            };
        }
    };

    window.DarkElfUtils.Growth = {
        RESERVE_ENTI: 0.1,
        RESERVE_DEFAULT: 0.2,

        oneTurn: function(P, rate, granary, grove) {
            let g = Math.floor(P / 10) + 2;
            if (granary) g += 4;
            if (grove) g += 2;
            return Math.floor(g * rate / 2);
        },

        project: function(inhab, rate, granaryFromTurn, grove, turns, free) {
            let sim = inhab;
            const capped = (free != null);
            for (let i = 1; i <= turns; i++) {
                if (capped && free <= 0) break;
                let g = this.oneTurn(sim, rate, i >= granaryFromTurn, grove);
                if (capped) { if (g > free) g = free; free -= g; }
                sim += g;
            }
            return sim;
        },

        reserveForRace: function(race) {
            const enti = (typeof race === 'string')
                ? (race === 'Enti')
                : !!(race && (race.key === 'ents' || race.cz === 'Enti'));
            return enti ? this.RESERVE_ENTI : this.RESERVE_DEFAULT;
        },

        maxVerb: function(projInhab, houses, buy, race) {
            return Math.max(0, Math.floor(projInhab - this.reserveForRace(race) * (houses + buy)));
        },

        housePrice: function(currentHouses, buy, weather) {
            let total = 0;
            for (let c = 0; c < buy; c++) {
                total += Math.floor((60 + Math.pow((currentHouses + 1 + c) / 9, 2)) * weather * 100 / 10000);
            }
            return total;
        }
    };

    window.DarkElfUtils.NeutralAPI = {
        SESTKA_SILA: 6,
        SESTKA_OBRANA: 5,
        MAG_SILA: 8,
        MAG_OBRANA: 4,

        DOMU_MIN: 48,

        OBYV_ZAKLAD: 10,

        STROP_SESTEK: 6,
        STROP_MAGU: 2,

        jeNeutralka: function(z) {
            return !!z && !z.hrac && z.min_utok != null && z.land_power > 0;
        },

        kandidati: function(z) {
            const out = [];
            const sila = z.land_power;
            const bonus = z.bonus_obrana || 0;
            for (let sestek = 0; sestek * this.SESTKA_SILA <= sila; sestek++) {
                const zbytek = sila - sestek * this.SESTKA_SILA;
                if (zbytek % this.MAG_SILA) continue;
                const magu = zbytek / this.MAG_SILA;
                const obrana = Math.floor(
                    (sestek * this.SESTKA_OBRANA + magu * this.MAG_OBRANA) * (1 + bonus / 100));
                out.push({ sestek: sestek, magu: magu, obyvatel: z.min_utok - obrana - 1 });
            }
            return out;
        },

        slozeni: function(z, den) {
            if (!this.jeNeutralka(z)) return null;
            const vsichni = this.kandidati(z);

            if (z.spehnora != null) {
                const sedi = vsichni.filter(k => k.obyvatel === z.spehnora);

                if (sedi.length !== 1) return null;
                return { sestek: sedi[0].sestek, magu: sedi[0].magu,
                         obyvatel: sedi[0].obyvatel, zdroj: 'spehnora' };
            }

            if (den == null || isNaN(den)) return null;

            const strop = this.OBYV_ZAKLAD + den;
            for (let i = 0; i < vsichni.length; i++) {
                const k = vsichni[i];
                if (k.obyvatel > strop) continue;

                if (k.sestek > den * 2 + this.STROP_SESTEK) return null;
                if (k.magu > den * 2 + this.STROP_MAGU) return null;
                return { sestek: k.sestek, magu: k.magu, obyvatel: k.obyvatel, zdroj: 'den' };
            }
            return null;
        },

        duvod: function(z, den) {
            if (!this.jeNeutralka(z)) return 'neni-neutralka';
            if (this.slozeni(z, den)) return 'ok';
            if (z.spehnora != null) return 'spehnora-nesedi';
            if (den == null || isNaN(den)) return 'bez-dne';
            return 'odlogla';
        },

        moznosti: function(z, den) {
            if (!this.jeNeutralka(z)) return [];
            return this.kandidati(z)
                .filter(k => k.obyvatel >= 0)
                .map(k => {
                    const domku = Math.max(this.DOMU_MIN, k.sestek + k.magu + k.obyvatel);
                    return { sestek: k.sestek, magu: k.magu, obyvatel: k.obyvatel,
                             domku: domku, mo: Math.floor(3 * k.magu * k.magu / domku) };
                })
                .sort((a, b) => a.mo - b.mo);
        },

        mo: function(z, den) {
            const s = this.slozeni(z, den);
            if (!s) return null;
            const domku = Math.max(this.DOMU_MIN, s.sestek + s.magu + s.obyvatel);
            const vez = window.DarkElfUtils.parseTower(z.img_vez);
            const zaklad = s.magu > 0 ? (3 * s.magu * s.magu / domku) : 0;
            const mo = Math.floor(zaklad * (vez ? (vez.magMul || 1) : 1) + (vez ? (vez.magAdd || 0) : 0));
            return { mo: mo, magu: s.magu, sestek: s.sestek, obyvatel: s.obyvatel,
                     domku: domku, vez: vez, zdroj: s.zdroj };
        }
    };

    window.DarkElfUtils.Spells = {

        LIST: {

            'Magický štít':        { cena: 30,     typ: 'zlute' },
            'Mana na zlato':       { cena: 60,     typ: 'zlute' },
            'Spokojenost':         { cena: 80,     typ: 'zlute' },
            'Magický štít velký':  { cena: 90,     typ: 'zlute' },
            'Příznivé počasí':     { cena: 100,    typ: 'zlute' },
            'Pás zmatení':         { cena: 100,    typ: 'zlute' },
            'Magické klima':       { cena: 150,    typ: 'zlute' },
            'Požehnání':           { cena: 200,    typ: 'zlute' },
            'Vojenský štít':       { cena: 200,    typ: 'zlute' },
            'Vojenský štít velký': { cena: 400,    typ: 'zlute' },

            'Ukrást peníze':       { cena: 30,     typ: 'cervene' },
            'Ukrást manu':         { cena: 30,     typ: 'cervene' },
            'Nespokojenost':       { cena: 40,     typ: 'cervene' },
            'Krupobití':           { cena: 50,     typ: 'cervene' },
            'Magický vír':         { cena: 50,     typ: 'cervene' },
            'Kletba':              { cena: 100,    typ: 'cervene' },
            'Dvojitá kletba':      { cena: 190,    typ: 'cervene' },
            'Blesk':               { cena: 200,    typ: 'cervene' },
            'Bouře':               { cena: 250,    typ: 'cervene' },
            'Černá smrt':          { cena: 350,    typ: 'cervene' },
            'Smrtící démon':       { cena: 600,    typ: 'cervene' },
            'Zemětřesení':         { cena: 800,    typ: 'cervene' },
            'Uragán':              { cena: 1500,   typ: 'cervene' },
            'Démon kamene':        { cena: 4000,   typ: 'cervene' },
            'Démon magie':         { cena: 5000,   typ: 'cervene' },
            'Soudný den':          { cena: 100000, typ: 'cervene' },

            'Magický šíp':         { cena: 20,   typ: 'cervene', rasa: 'Lidé' },
            'Strach':              { cena: 50,   typ: 'cervene', rasa: 'Barbaři' },
            'Magické oko':         { cena: 50,   typ: 'zlute',   rasa: 'Hobiti' },
            'Nápoj lásky':         { cena: 60,   typ: 'zlute',   rasa: 'Enti' },
            'Děs obyvatelstva':    { cena: 100,  typ: 'cervene', rasa: 'Skuruti' },
            'Odražeč štítů':       { cena: 100,  typ: 'cervene', rasa: 'Temní elfové' },
            'Neovlivnitelnost':    { cena: 120,  typ: 'zlute',   rasa: 'Trpaslíci' },
            'Uzdravení':           { cena: 125,  typ: 'zlute',   rasa: 'Elfové' },
            'Povodeň':             { cena: 300,  typ: 'cervene', rasa: 'Skřeti' },
            'Zasypání':            { cena: 800,  typ: 'cervene', rasa: 'Mágové' },
            'Zmrtvýchvstání':      { cena: 1200, typ: 'zlute',   rasa: 'Nekromanti' }
        },

        ALIAS: {
            'spoko':   'Spokojenost',
            'nespo':   'Nespokojenost',
            'des':     'Děs obyvatelstva',
            'neovl':   'Neovlivnitelnost',
            'pozehn':  'Požehnání',
            'klima':   'Magické klima',
            'pocasi':  'Příznivé počasí',
            'oko':     'Magické oko',

            'smd':     'Smrtící démon',
            'cs':      'Černá smrt',
            'pz':      'Pás zmatení',
            'msv':     'Magický štít velký',
            'pozeh':   'Požehnání',

            'vsv':        'Vojenský štít velký',
            'vvs':        'Vojenský štít velký',
            'priznivko':  'Příznivé počasí',
            'krupky':     'Krupobití',
            'k':          'Kletba',
            'dk':         'Dvojitá kletba',
            'neovlivko':  'Neovlivnitelnost',
            'uzdravko':   'Uzdravení',
            'zmrtko':     'Zmrtvýchvstání',

            'vir':        'Magický vír'
        },

        ZKRATKA: {
            'Spokojenost':         'spoko',
            'Nespokojenost':       'nespo',
            'Děs obyvatelstva':    'des',
            'Neovlivnitelnost':    'neovlivko',
            'Požehnání':           'Požeh',
            'Příznivé počasí':     'příznivko',
            'Magické oko':         'oko',
            'Krupobití':           'krupky',
            'Kletba':              'K',
            'Dvojitá kletba':      'DK',
            'Uzdravení':           'uzdrávko',
            'Zmrtvýchvstání':      'zmrtko',

            'Smrtící démon':       'SmD',
            'Černá smrt':          'ČS',
            'Magický štít velký':  'MŠV',
            'Vojenský štít velký': 'VŠV',
            'Pás zmatení':         'PZ',
            'Magický vír':         'vír'
        },

        OSY: {
            'Spokojenost':      { porodnost:  1 },
            'Příznivé počasí':  { zlato:      1 },
            'Magické klima':    { mana:       1 },
            'Požehnání':        { porodnost:  1, zlato:  1, mana:  1 },
            'Nespokojenost':    { porodnost: -1 },
            'Krupobití':        { zlato:     -1 },
            'Magický vír':      { mana:      -1 },
            'Kletba':           { porodnost: -1, zlato: -1, mana: -1 },
            'Dvojitá kletba':   { porodnost: -2, zlato: -2, mana: -2 }
        },

        DRZI_OSU:  { 'Neovlivnitelnost': ['porodnost'] },
        LECI_OSU:  { 'Uzdravení': ['zlato', 'mana'] },

        kroky: function(nazev) {
            return this.OSY[nazev] || null;
        },

        KATEGORIE: [

            { nazev: 'Nejčastější',   kouzla: ['Spokojenost'] },
            { nazev: 'Nejčastější',   kouzla: ['Nespokojenost'] },
            { nazev: 'Hospodářské',   kouzla: ['Mana na zlato', 'Příznivé počasí', 'Magické klima',
                                               'Požehnání', 'Krupobití', 'Magický vír',
                                               'Kletba', 'Dvojitá kletba'] },
            { nazev: 'Obranné',       kouzla: ['Magický štít', 'Magický štít velký', 'Pás zmatení',
                                               'Vojenský štít', 'Vojenský štít velký'] },
            { nazev: 'Zlodějské',     kouzla: ['Ukrást peníze', 'Ukrást manu'] },
            { nazev: 'Destruktivní',  kouzla: ['Blesk', 'Bouře', 'Černá smrt', 'Smrtící démon',
                                               'Zemětřesení', 'Uragán', 'Démon kamene',
                                               'Démon magie', 'Soudný den'] }
        ],

        kategorie: function(nazev) {
            for (let i = 0; i < this.KATEGORIE.length; i++) {
                const j = this.KATEGORIE[i].kouzla.indexOf(nazev);
                if (j > -1) return { skupina: i, poradi: j, nazev: this.KATEGORIE[i].nazev };
            }

            const rasova = Object.keys(this.LIST).indexOf(nazev);
            return { skupina: this.KATEGORIE.length,
                     poradi: rasova > -1 ? rasova : 999,
                     nazev: 'Speciální' };
        },

        zkratka: function(nazev) {
            return this.ZKRATKA[nazev] || nazev;
        },

        norm: function(text) {
            return String(text == null ? '' : text)
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        _index: null,
        _build: function() {
            if (this._index) return this._index;
            const idx = {};
            for (const nazev in this.LIST) idx[this.norm(nazev)] = nazev;
            for (const zkratka in this.ALIAS) idx[this.norm(zkratka)] = this.ALIAS[zkratka];
            this._index = idx;
            return idx;
        },

        byName: function(text) {
            const t = this.norm(text);
            if (!t) return null;
            const idx = this._build();

            let klic = null;
            if (idx[t]) {
                klic = t;
            } else {
                for (const k in idx) {
                    if (t.indexOf(k) !== 0) continue;

                    const dalsi = t.charAt(k.length);
                    if (dalsi && /[^\W\d_]/u.test(dalsi)) continue;
                    if (!klic || k.length > klic.length) klic = k;
                }
            }
            if (!klic) return null;

            const nazev = idx[klic];
            const info = this.LIST[nazev];

            const raw = String(text == null ? '' : text);
            let zbytekRaw = '';
            for (let i = 1; i <= raw.length; i++) {
                if (this.norm(raw.slice(0, i)) === klic) { zbytekRaw = raw.slice(i).trim(); break; }
            }

            return {
                nazev: nazev,
                cena: info.cena,
                typ: info.typ,
                rasa: info.rasa || null,
                zbytek: t.slice(klic.length).trim(),
                zbytekRaw: zbytekRaw
            };
        },

        maSlevu: function(nazev) {
            const info = this.LIST[nazev];
            return !!info && info.typ === 'zlute';
        },

        slevaRozsah: function(mojeRasaId) {
            const out = { nejlepsi: 0, moje: 0, dostupne: false };
            try {
                const counts = window.DarkElfUtils.AllianceAPI.getRaceCounts();
                if (!counts || !counts.total) return out;
                out.dostupne = true;
                for (const id in counts.byId) {
                    const d = window.DarkElfUtils.AllianceAPI.getDiscount(parseInt(id, 10), 'spells');
                    if (d > out.nejlepsi) out.nejlepsi = d;
                }
                if (mojeRasaId != null) {
                    out.moje = window.DarkElfUtils.AllianceAPI.getDiscount(parseInt(mojeRasaId, 10), 'spells');
                }
            } catch (e) {  }
            return out;
        }
    };

    window.DarkElfUtils.SpellsCastAPI = {
        URL: '/spells_list.asp?sort=1',
        _CACHE: 'spells_cast',

        _idZOdkazu: function(a, klic) {
            const m = String((a && a.getAttribute('href')) || '').match(new RegExp(klic + '=(\\d+)'));
            return m ? parseInt(m[1], 10) : null;
        },

        parse: function(doc) {
            const out = { clenove: [], kouzla: [] };
            if (!doc || !doc.querySelectorAll) return out;
            const cist = (el) => String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

            doc.querySelectorAll('p').forEach(p => {
                const a = p.querySelector('a[href*="id_player="]');
                if (!a) return;
                const m = cist(p).match(/:\s*(\d+)\s*\/\s*(\d+),\s*s[íi]la:\s*(\d+)\s*-\s*(\d+)/i);
                if (!m) return;
                out.clenove.push({
                    jmeno: cist(a), id: this._idZOdkazu(a, 'id_player'),
                    seslano: parseInt(m[1], 10), celkem: parseInt(m[2], 10),
                    silaMin: parseInt(m[3], 10), silaMax: parseInt(m[4], 10)
                });
            });

            let kouzlic = null, kouzlicId = null, cil = null, cilId = null, samSobe = false;
            doc.querySelectorAll('th, p, span').forEach(el => {
                if (el.tagName === 'TH') {
                    if (!/Kouzla\s+vl[áa]dce/i.test(cist(el))) return;
                    const a = el.querySelector('a[href*="id_player="]');
                    kouzlic = a ? cist(a) : null;
                    kouzlicId = a ? this._idZOdkazu(a, 'id_player') : null;
                    cil = null; cilId = null; samSobe = false;
                    return;
                }
                if (el.tagName === 'P') {
                    const a = el.querySelector('a[href*="id_player_dest="]');
                    if (!a) return;
                    cil = cist(a);
                    cilId = this._idZOdkazu(a, 'id_player_dest');
                    samSobe = /s[áa]m\s+sob[ěe]/i.test(cist(el));
                    return;
                }

                const aZem = el.querySelector && el.querySelector(':scope > a[href*="spells_list.asp?l="]');
                if (!aZem) return;

                let zbytek = '';
                for (let n = aZem.nextSibling; n; n = n.nextSibling) zbytek += (n.textContent || '');
                const m = zbytek.replace(/\s+/g, ' ').match(/^\s*-\s*(.+?):\s*(-?\d+)/);
                if (!m) return;

                const info = window.DarkElfUtils.Spells.byName(m[1]);
                out.kouzla.push({
                    kouzlic: kouzlic, kouzlicId: kouzlicId,
                    cil: cil, cilId: cilId, samSobe: samSobe,
                    zeme: cist(aZem), zemeId: this._idZOdkazu(aZem, 'l'),
                    kouzlo: info ? info.nazev : m[1].trim(),
                    typ: info ? info.typ : null,
                    sila: parseInt(m[2], 10)
                });
            });
            return out;
        },

        fetch: async function(force) {
            const C = window.DarkElfUtils.Cache;
            if (!force) {
                const c = C.get('api', this._CACHE);
                if (c) return c;
            }
            try {
                const doc = await window.DarkElfUtils.fetchPage(this.URL);
                if (!doc) return C.get('api', this._CACHE) || null;
                const data = this.parse(doc);

                if (!data.kouzla.length && !data.clenove.length) return C.get('api', this._CACHE) || null;
                C.set('api', this._CACHE, data);
                return data;
            } catch (e) {
                console.warn('DarkElfUtils.SpellsCastAPI.fetch:', e.message);
                return C.get('api', this._CACHE) || null;
            }
        },

        get: function() { return window.DarkElfUtils.Cache.get('api', this._CACHE); }
    };

    function _parseHeroIds(doc, countryId) {
        if (!doc) return [];
        const cid = String(countryId);
        const ids = [];
        const sber = (root) => {
            root.querySelectorAll('a[href*="hero.asp?h="]').forEach(link => {
                const m = (link.getAttribute('href') || '').match(/hero\.asp\?h=(\d+)/i);
                if (m) {
                    const id = parseInt(m[1], 10);
                    if (!ids.includes(id)) ids.push(id);
                }
            });
        };

        if (/^[\w-]+$/.test(cid)) {
            doc.querySelectorAll('[id="h' + cid + '"]').forEach(sber);
        } else {
            const el = doc.getElementById('h' + cid);
            if (el) sber(el);
        }
        return ids;
    }

    let _mapDocPromise = null;
    function _fetchMapDoc() {
        if (!_mapDocPromise) _mapDocPromise = window.DarkElfUtils.fetchPage('/map_new.asp');
        return _mapDocPromise;
    }

    if (window.location.pathname.toLowerCase().includes('map_new.asp') ||
        window.name === 'mapa') {

        window.parent.addEventListener('message', function(event) {
            const msg = event.data;
            if (!msg || msg.type !== 'DE_HERO_REQUEST' || !msg.id) return;
            const heroIds = _parseHeroIds(document, msg.id);
            try {
                window.parent.postMessage(
                    { type: 'DE_HERO_RESPONSE', id: msg.id, heroIds },
                    '*'
                );
            } catch(e) {}
        });
    }

    window.DarkElfUtils.HeroAPI = {

        getIds: function(countryId, forceRefresh) {
            if (!forceRefresh) {
                const cached = window.DarkElfUtils.Cache.get('heroIds', countryId);
                if (cached !== null) return Promise.resolve(cached);
            }

            function _fallback(duvod, resolve) {
                return _fetchMapDoc().then(doc => {
                    if (!doc) {
                        console.warn('DarkElfUtils.HeroAPI.getIds: ' + duvod + ' a záložní' +
                                     ' stažení map_new.asp selhalo (země ' + countryId + ')' +
                                     ' – počítá se BEZ hrdinů.');
                        resolve([]);
                        return;
                    }
                    const ids = _parseHeroIds(doc, countryId);
                    window.DarkElfUtils.Cache.set('heroIds', countryId, ids);
                    console.warn('DarkElfUtils.HeroAPI.getIds: ' + duvod +
                                 ' – hrdiny (' + ids.length + ') jsem vzal ze staženého' +
                                 ' map_new.asp (země ' + countryId + ').');
                    resolve(ids);
                });
            }

            if (window.parent === window) {
                return new Promise((resolve) => _fallback('stránka běží mimo herní rámy', resolve));
            }

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    window.parent.removeEventListener('message', handler);

                    _fallback('mapový rám neodpověděl do 3 s', resolve);
                }, 3000);

                function handler(event) {
                    const msg = event.data;
                    if (!msg || msg.type !== 'DE_HERO_RESPONSE') return;
                    if (String(msg.id) !== String(countryId)) return;
                    clearTimeout(timeout);
                    window.parent.removeEventListener('message', handler);
                    const ids = msg.heroIds || [];
                    window.DarkElfUtils.Cache.set('heroIds', countryId, ids);
                    resolve(ids);
                }

                window.parent.addEventListener('message', handler);
                try {
                    window.parent.postMessage(
                        { type: 'DE_HERO_REQUEST', id: countryId },
                        '*'
                    );
                } catch(e) {
                    clearTimeout(timeout);
                    window.parent.removeEventListener('message', handler);
                    _fallback('postMessage selhal (' + e.message + ')', resolve);
                }
            });
        }
    };

    let currentLeague = window.DarkElfUtils.getLeague();
    if (currentLeague !== 'DEFAULT' && !window.location.pathname.includes('login') && !window.location.pathname.includes('ligy.asp')) {
        localStorage.setItem("de_last_known_league", currentLeague);
    }

    document.addEventListener('click', function(e) {
        if (localStorage.getItem('de_picker_mode') === 'hero') {
            const link = e.target.closest('a');
            if (link && link.href && link.href.toLowerCase().includes('hero.asp?h=')) {
                e.preventDefault();
                e.stopPropagation();
                let m = link.href.match(/hero\.asp\?h=(\d+)/i);
                if (m) {
                    localStorage.removeItem('de_picker_mode');
                    let overlay = document.getElementById('de-picker-overlay');
                    if (overlay) overlay.remove();

                    const msg = { type: 'DE_HERO_PICKED', id: m[1] };
                    const broadcast = (win) => {
                        try { win.postMessage(msg, '*'); } catch(err){}
                        try {
                            for(let i=0; i<win.frames.length; i++) {
                                broadcast(win.frames[i]);
                            }
                        } catch(err){}
                    };
                    broadcast(window.top);
                }
            }
        }
    }, true);

    console.log(`[DarkElfUtils v${window.DarkElfUtils.VERSION}] Inicializováno pro ligu: ${currentLeague}`);

})();

}

(function() {
    'use strict';

    if (!window.DarkElfUtils) {
        console.warn('[Noxtrip] DarkElfUtils není načteno.');
        return;
    }

    const MAP_CASTING_LS_LANDS = "DE_mapCasting_lands";

    function normalizeText(text) {
        if (!text) return "";
        return text.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    }

    function getStorageKeyWithLeague(leagueId) {
        return `${MAP_CASTING_LS_LANDS}_${leagueId}`;
    }

    function init() {
        if (!window.location.href.includes("magie.asp")) return;
        addSelectButton();
        addOdecitac();
        addPrehledML();
    }

    function addSelectButton() {
        const selectPlayer = document.getElementsByName("vladce")[0];
        if (!selectPlayer) return;

        const button = document.createElement('button');
        button.id = 'noxtrip_player_casting_VSK';
        button.className = "butt_sml";

        button.style.cssText = "margin: 8px auto 0 auto; cursor: pointer; display: block;";

        const img = document.createElement('img');
        img.src = "images/mapy/but_select.gif";
        img.style.maxWidth = "30px";

        button.appendChild(img);
        button.onclick = (e) => {
            e.preventDefault();
            handleSelection();
        };

        selectPlayer.parentNode.appendChild(button);
    }

    async function handleSelection() {
        const selectPlayer = document.getElementsByName("vladce")[0];
        const textAreaMagic = document.getElementById("textAreaMagic");

        let targetPlayer = null;
        let inputLands = [];

        if (selectPlayer && selectPlayer.selectedIndex > 0) {
            const selectedText = selectPlayer.options[selectPlayer.selectedIndex].text;
            const match = selectedText.match(/(.*?) \(/);
            if (match) targetPlayer = match[1].trim();
        }

        if (!targetPlayer && textAreaMagic && textAreaMagic.value.trim() !== "") {
            inputLands = textAreaMagic.value.split(',').map(l => l.trim()).filter(l => l !== "");
        }

        if (targetPlayer || inputLands.length > 0) {
            try {
                const result = await fetchAndParseMap(targetPlayer, inputLands);

                if (result.lands.length > 0) {
                    saveToStorageAndRefresh(result);

                    if (inputLands.length > 0) {
                        const foundNormalized = result.foundInputs;
                        const missing = inputLands.filter(l => !foundNormalized.includes(normalizeText(l)));

                        if (missing.length > 0) {
                            alert("✅ Hotovo: " + result.lands.length + " zemí přidáno.\n\n" +
                                  "❌ Nenalezeno: \n" +
                                  missing.join(", ") +
                                  "\n\nTip: Pokud vidíš dva názvy u sebe, zapomněl jsi mezi ně napsat čárku!");
                        }
                    }
                } else {
                    alert("❌ Chyba: Žádná ze zadaných zemí nebyla na mapě nalezena. Zkontroluj překlepy.");
                }
            } catch (error) {
                console.error("Chyba skriptu:", error);
            }
        } else {
            alert("Nejdřív vyber vládce nebo napiš názvy zemí.");
        }
    }

    async function fetchAndParseMap(player, landsList) {
        const html = await window.DarkElfUtils.fetchPage("/map_new.asp");
        return parseMapData(player, landsList, html);
    }

    function parseMapData(player, landsList, html) {
        const result = { lands: [], foundInputs: [] };

        if (!html) return result;
        const doc = (typeof html === 'string') ? new DOMParser().parseFromString(html, 'text/html') : html;

        const normalizedInputs = landsList.map(l => normalizeText(l));
        const mapDivs = doc.querySelectorAll("div[data-name]");

        mapDivs.forEach(div => {
            const dName = div.getAttribute("data-name");
            const dPlayer = div.getAttribute("data-player");
            const dId = div.getAttribute("data-id");
            const dNameNorm = normalizeText(dName);

            if (player) {
                if (dPlayer === player) {
                    result.lands.push([dId, dName]);
                }
            } else if (normalizedInputs.length > 0) {
                if (normalizedInputs.includes(dNameNorm)) {
                    result.lands.push([dId, dName]);
                    if (!result.foundInputs.includes(dNameNorm)) {
                        result.foundInputs.push(dNameNorm);
                    }
                }
            }
        });
        return result;
    }

    function saveToStorageAndRefresh(mapData) {

        let leagueId = window.DarkElfUtils.getLeague();
        if (leagueId === 'DEFAULT') {
            try { leagueId = localStorage.getItem("de_last_known_league") || leagueId; } catch (e) {}
        }
        const storageKey = getStorageKeyWithLeague(leagueId);
        window.localStorage.setItem(storageKey, JSON.stringify({
            lands: mapData.lands,
            updatedAt: Date.now()
        }));

        for (let i = 0; i < window.parent.frames.length; i++) {
            const f = window.parent.frames[i];
            try {
                if (f.name === 'mapa' || f.location.pathname.includes("map_new.asp")) {
                    f.location.reload();
                }
            } catch (err) { }
        }
    }

    const ODEC_LS = "DE_odecitac";

    const ZEME_ODDELOVAC = /[,;|\/]|\s[-–—]\s/;

    const ZEME_SMETI = /^[\s,;|\/\-–—]+|[\s,;|\/\-–—]+$/g;

    const ZEME_MO_RE = /\(\s*(?:mo\s*)?(\d+)\s*(\+)?\s*\)/i;

    function parseLands(text) {
        const out = [];
        String(text || "").split(/\r?\n/).forEach(line => {
            const c = line.indexOf(":");
            const telo = (c > -1) ? line.slice(c + 1) : line;
            telo.split(ZEME_ODDELOVAC).forEach(part => {
                const name = String(part || "").replace(ZEME_MO_RE, " ")
                    .replace(/\s+/g, " ").replace(ZEME_SMETI, "").trim();
                if (name) out.push(name);
            });
        });
        return out;
    }

    function moZeZavorek(text) {
        const out = {};
        String(text || "").split(/\r?\n/).forEach(line => {
            const c = line.indexOf(":");
            const telo = (c > -1) ? line.slice(c + 1) : line;
            telo.split(ZEME_ODDELOVAC).forEach(part => {
                const kus = String(part || "");
                const m = kus.match(ZEME_MO_RE);
                if (!m) return;
                const jmeno = kus.replace(ZEME_MO_RE, " ")
                    .replace(/\s+/g, " ").replace(ZEME_SMETI, "").trim();
                if (jmeno) out[normalizeText(jmeno)] = "MO" + m[1] + (m[2] || "");
            });
        });
        return out;
    }

    function odecLigaKlic(jmeno) {
        let liga = window.DarkElfUtils.getLeague();
        if (liga === "DEFAULT") {
            try { liga = localStorage.getItem("de_last_known_league") || liga; } catch (e) {}
        }
        return ODEC_LS + "_" + jmeno + "_" + liga;
    }

    function addOdecitac() {
        const ta = document.getElementById("textAreaMagic");
        if (!ta || document.getElementById("odec_box")) return;
        const cil = ta.parentNode;
        if (!cil) return;

        const box = document.createElement("div");
        box.id = "odec_box";

        box.style.cssText = "margin:6px 0 2px 0;font-family:Arial;font-size:11px;"
            + "max-width:100%;overflow-wrap:break-word;word-break:break-word;";
        cil.appendChild(box);
    }

    function kouzloSNasobkem(text) {
        const s = vytahniNasobek(text);
        let k = window.DarkElfUtils.Spells.byName(s.zbytek);
        if (k && !k.zbytekRaw) return { kouzlo: k, nasobek: s.nasobek };

        const holeCislo = String(text || "").match(/^\s*(\d+)\s+(.+)$/);
        if (holeCislo) {
            k = window.DarkElfUtils.Spells.byName(holeCislo[2]);
            if (k && !k.zbytekRaw) return { kouzlo: k, nasobek: parseInt(holeCislo[1], 10) };
        }
        return null;
    }

    const MO_ZA_KOUZLEM = /^\s*(mo\s*\d+(?:\s*-\s*\d+)?\s*\+?)\s*\??\s*/i;

    function kouzlaAPakZeme(line) {
        const tokeny = String(line || "").trim().split(/\s+/).filter(Boolean);
        if (!tokeny.length) return null;

        const kouzla = [];
        let i = 0;
        while (i < tokeny.length) {
            let sebrano = null;
            for (let delka = Math.min(4, tokeny.length - i); delka >= 1; delka--) {
                const k = kouzloSNasobkem(tokeny.slice(i, i + delka).join(" "));
                if (k) { sebrano = { k: k, dalsi: i + delka }; break; }
            }
            if (!sebrano) break;
            kouzla.push(sebrano.k);
            i = sebrano.dalsi;
        }
        if (!kouzla.length) return null;

        let zbytek = tokeny.slice(i).join(" ");
        const mo = zbytek.match(MO_ZA_KOUZLEM);
        if (mo) zbytek = zbytek.slice(mo[0].length);

        return { kouzla: kouzla, mo: mo ? vytahniMO(mo[1]) : "", zemeText: zbytek };
    }

    function zemeAPakKouzla(line, zemeIdx) {
        const casti = String(line || "").split(",").map(c => c.trim()).filter(Boolean);
        if (!casti.length) return null;

        if (kouzloSNasobkem(casti[0])) return null;

        const slova = casti[0].split(/\s+/);
        let zem = null, prvni = null;
        for (let i = 1; i < slova.length; i++) {
            const kandidat = kouzloSNasobkem(slova.slice(i).join(" "));
            if (!kandidat) continue;
            zem = slova.slice(0, i).join(" ");
            prvni = kandidat;
            break;
        }
        if (!zem || !prvni) return null;
        if (zemeIdx && !zemeIdx[normalizeText(zem)]) return null;

        const kouzla = [prvni];
        for (let i = 1; i < casti.length; i++) {
            const dalsi = kouzloSNasobkem(casti[i]);
            if (!dalsi) return null;
            kouzla.push(dalsi);
        }
        return { zeme: [zem], kouzla: kouzla };
    }

    function parseMLLine(line) {
        const c = line.indexOf(":");
        if (c === -1) return { stitek: "", telo: line.trim(), maDvojtecku: false };
        return { stitek: line.slice(0, c).trim(), telo: line.slice(c + 1).trim(), maDvojtecku: true };
    }

    function vytahniNasobek(stitek) {
        const t = String(stitek || "");

        const pred = t.match(/^\s*(\d+)\s*[×xX*]\s*(.+)$/);
        if (pred) return { nasobek: parseInt(pred[1], 10), zbytek: pred[2] };

        const dvoj = t.match(/^\s*dvoj\s*(.+)$/i);
        if (dvoj && window.DarkElfUtils.Spells.byName(dvoj[1])) {
            return { nasobek: 2, zbytek: dvoj[1] };
        }

        const za = t.match(/(\d+)\s*[×xX*](?=$|[\s_])/);
        if (za) {
            const zbytek = (t.slice(0, za.index) + " " + t.slice(za.index + za[0].length))
                .replace(/\s+/g, " ").trim();
            return { nasobek: parseInt(za[1], 10), zbytek: zbytek };
        }
        return { nasobek: 1, zbytek: t };
    }

    function ozdobnyNadpis(line) {
        const t = String(line || "");
        const maOzdobu = /^[\s\-=*_#~]*[\-=*_#~]/.test(t) || /[\-=*_#~][\s\-=*_#~]*$/.test(t);
        if (!maOzdobu) return null;
        const holy = t.replace(/^[\s\-=*_#~]+/, "").replace(/[\s\-=*_#~]+$/, "").replace(/:$/, "").trim();
        if (!holy || holy.indexOf(",") > -1) return null;
        if (holy.split(/\s+/).length > 4) return null;
        return holy;
    }

    const VEZ_ZKRATKY = { osv: 5, mmv: 20, omv: 50 };
    const VEZ_ZKRATKY_RE = /(^|[\s_])(osv|mmv|omv)(?=$|[\s_])/i;

    const PRIZNAK_NEU_RE = /(^|[\s_])neu(?=$|[\s_])/i;

    function maNeu(stitek) {
        return PRIZNAK_NEU_RE.test(String(stitek || ""));
    }

    const PRIZNAK_SKMAX_RE = /(^|[\s_])(sk\s*max|nejvy[šs]{1,2}[íi]?\s*sk)(?=$|[\s_])/i;

    function maSKmax(stitek) {
        return PRIZNAK_SKMAX_RE.test(String(stitek || ""));
    }

    const SKMAX_TOLERANCE = 0.8;

    function nejsilnejsiClen(cast) {
        let nej = null;
        ((cast && cast.clenove) || []).forEach(c => {
            if (!nej || (c.silaMax || 0) > (nej.silaMax || 0)) nej = c;
        });
        return (nej && nej.silaMax) ? nej : null;
    }

    function zpusobilySKmax(silaMax, cast) {
        const nej = nejsilnejsiClen(cast);
        if (!nej) return false;
        return (silaMax || 0) >= Math.ceil(nej.silaMax * SKMAX_TOLERANCE);
    }

    function prahSKmaxSily(cast) {
        const nej = nejsilnejsiClen(cast);
        if (!nej) return 0;
        const min = nej.silaMin || Math.round(nej.silaMax / 3);
        return Math.round((min + nej.silaMax) / 2);
    }

    const SLOVO_NEUTRALKA_RE = /(^|[\s_])neutr[a-záčďéěíňóřšťúůýž]*(?=$|[\s_])/i;

    function vytahniMO(text) {
        const zk = String(text || "").match(VEZ_ZKRATKY_RE);
        if (zk) return "MO" + VEZ_ZKRATKY[zk[2].toLowerCase()];

        const m = String(text || "").match(/mo\s*(\d+)(?:\s*-\s*(\d+))?(\s*\+)?/i);
        if (!m) return "";
        const cislo = (x) => String(parseInt(x, 10));
        let out = "MO" + cislo(m[1]);
        if (m[2] != null) out += "-" + cislo(m[2]);
        if (m[3]) out += "+";
        return out;
    }

    function maPrioritu(stitek) {
        return /!/.test(String(stitek || ""));
    }

    function slucRadky(radky) {
        const poradi = [];
        const podleKlice = {};
        radky.forEach(r => {

            const deliPoznamka = (r.kat === KAT_ZAKOUZLENO);
            const klic = [r.kat || "", r.kouzlo.nazev, r.mo, deliPoznamka ? r.poznamka : "",
                          r.nasobek, r.prio ? "!" : "", r.neu ? "neu" : "",
                          r.skmax ? "skmax" : ""].join("|");
            if (!podleKlice[klic]) {
                podleKlice[klic] = { kouzlo: r.kouzlo, mo: r.mo, neu: !!r.neu,
                                     skmax: !!r.skmax,
                                     poznamka: deliPoznamka ? r.poznamka : "", kat: r.kat,
                                     nasobek: r.nasobek, prio: r.prio, zeme: [], videno: [],
                                     poznamky: [], moZeme: {} };
                poradi.push(klic);
            }
            const cil = podleKlice[klic];
            if (r.poznamka && cil.poznamky.indexOf(r.poznamka) === -1) cil.poznamky.push(r.poznamka);
            Object.keys(r.moZeme || {}).forEach(k => { cil.moZeme[k] = r.moZeme[k]; });
            r.zeme.forEach(z => {
                const n = normalizeText(z);
                if (cil.videno.indexOf(n) === -1) { cil.videno.push(n); cil.zeme.push(z); }
            });
        });

        const out = poradi.map(k => podleKlice[k]);
        return out.filter(r => r.prio).concat(out.filter(r => !r.prio));
    }

    function hlavickaML(line) {
        const m = String(line || "").match(/^\s*ML\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*$/i);
        return m ? { den: parseInt(m[1], 10), mesic: parseInt(m[2], 10), text: line.trim() } : null;
    }

    const KAT_TOP = "Top prio";
    const KAT_ZAKOUZLENO = "Zakouzleno";
    const KAT_VYCHOZI = "Prio 1";

    const KAT_JISTOTA = "Pro jistotu překouzlit s max SK";
    const KAT_PEVNE = [KAT_TOP, "Prio 1", "Prio 2", "Prio 3", KAT_JISTOTA];

    function katZeSekce(nazev) {
        const n = normalizeText(nazev || "");
        if (!n) return null;
        if (n.indexOf("zakouzl") > -1) return KAT_ZAKOUZLENO;

        if (n.indexOf("jistot") > -1) return KAT_JISTOTA;
        if (n.indexOf("top prio") > -1) return KAT_TOP;
        const m = n.match(/^prio\s*(\d+)/);
        if (m) return "Prio " + m[1];
        return String(nazev).trim();
    }

    function jeHracskaSekce(sekceNazev) {
        const kat = katZeSekce(sekceNazev);
        return !!kat && kat !== KAT_ZAKOUZLENO && KAT_PEVNE.indexOf(kat) === -1;
    }

    function holyNadpis(line) {
        const t = String(line || "").replace(/:\s*$/, "").trim();
        if (!t || t.indexOf(",") > -1) return null;
        return jeHracskaSekce(t) ? null : t;
    }

    function posudJmeno(text, znamiHraci) {
        if (!znamiHraci || !znamiHraci.length) return { typ: "nevim", kandidati: [] };
        const t = normalizeText(text);
        if (!t) return { typ: "nevim", kandidati: [] };

        const presne = znamiHraci.filter(h => normalizeText(h) === t);
        if (presne.length) return { typ: "hrac", kandidati: presne };

        const zacina = znamiHraci.filter(h => normalizeText(h).indexOf(t) === 0);
        return { typ: "nejiste", kandidati: zacina };
    }

    function majitelZemi(zeme, zemeIdx) {
        if (!zemeIdx || !zeme || !zeme.length) return null;
        const maj = [];
        for (let i = 0; i < zeme.length; i++) {
            const z = zemeIdx[normalizeText(zeme[i])];
            if (!z || !z.hrac) continue;
            if (maj.indexOf(z.hrac) === -1) maj.push(z.hrac);
            if (maj.length > 1) return null;
        }
        return maj.length === 1 ? maj[0] : null;
    }

    function posudNaJmeno(text, ctx, majitel, ptatSe) {
        const klic = normalizeText(text);
        const drive = ctx && ctx.rozhodnuti && ctx.rozhodnuti[klic];
        if (drive) return (drive.typ === "poznamka") ? {} : { hrac: drive.jmeno || text };

        const zeptejSe = (kandidati) => {
            if (!ptatSe || !ctx || !ctx.nejista) return;
            if (ctx.nejista.some(x => x.klic === klic)) return;
            ctx.nejista.push({ klic: klic, text: text, kandidati: kandidati });
        };

        const hraci = (ctx && ctx.hraci) || [];

        if (!hraci.length) { zeptejSe([]); return {}; }

        const soud = posudJmeno(text, hraci);
        if (soud.typ === "hrac") return { hrac: text };

        if (majitel && normalizeText(majitel).indexOf(klic) === 0) return { hrac: text };

        const kandidati = [];
        if (majitel) kandidati.push(majitel);
        soud.kandidati.forEach(k => { if (kandidati.indexOf(k) === -1) kandidati.push(k); });

        zeptejSe(kandidati);
        return kandidati.length ? { hrac: text } : {};
    }

    function rozdelHraceAPoznamku(zbytek, uvnitrHracskeSekce, ctx, majitel, ptatSe) {
        const t = String(zbytek || "").trim();
        if (!t) return { hrac: "", poznamka: "" };
        if (uvnitrHracskeSekce) return { hrac: "", poznamka: t };

        let jmenoText = t, poznText = "";
        const m = t.match(/^([^=(]+?)\s*[=(]\s*(.+?)\)?$/);
        if (m) { jmenoText = m[1].trim(); poznText = m[2].trim(); }

        const soud = posudNaJmeno(jmenoText, ctx, majitel, ptatSe);
        if (soud.hrac) return { hrac: soud.hrac, poznamka: poznText };
        return { hrac: "", poznamka: t };
    }

    function katRadku(sekceNazev, prio, hrac) {
        const zeSekce = katZeSekce(sekceNazev);
        if (zeSekce === KAT_ZAKOUZLENO) return KAT_ZAKOUZLENO;
        if (prio) return KAT_TOP;

        if (jeHracskaSekce(sekceNazev)) return KAT_VYCHOZI;
        if (hrac) return KAT_VYCHOZI;
        return zeSekce || KAT_VYCHOZI;
    }

    function denZMapy(ctx) {
        if (ctx && ctx.den != null) return ctx.den;
        try {
            const h = window.DarkElfUtils.MapAPI.getHeader();
            const d = h && h.den != null ? parseInt(h.den, 10) : NaN;
            return isNaN(d) ? null : d;
        } catch (e) { return null; }
    }

    function popisDuvoduNeu(duvod) {
        if (duvod === "bez-dne") return "nemám herní den — nenačetla se mapa?";
        if (duvod === "spehnora-nesedi") return "špehnora nesedí na žádné složení — divná data";
        return "neobsazená země po odloglém hráči — model na ni neplatí";
    }

    function moznostiNeu(jmeno, z, den) {
        const N = window.DarkElfUtils && window.DarkElfUtils.NeutralAPI;
        if (!N || !z) return null;
        const duvod = N.duvod(z, den);
        if (duvod === "ok" || duvod === "neni-neutralka") return null;
        if (duvod === "bez-dne") return jmeno + " — " + popisDuvoduNeu(duvod);
        const mozne = N.moznosti(z, den).map(m => m.mo);
        const unik = mozne.filter((m, i) => mozne.indexOf(m) === i);
        return jmeno + " — odloglá zem"
            + (unik.length ? (", možné MO: " + unik.join(", ")) : ", složení se nedá rozložit");
    }

    function doplnNeutralky(sekce, ctx) {
        const N = window.DarkElfUtils && window.DarkElfUtils.NeutralAPI;
        if (!N || !ctx || !ctx.zemeIdx) return;
        const den = denZMapy(ctx);

        function zarad(r, jmeno) {
            if ((r.moZeme || {})[normalizeText(jmeno)]) return "";
            const z = ctx.zemeIdx[normalizeText(jmeno)];
            if (!z || !N.jeNeutralka(z)) return "";
            const v = N.mo(z, den);
            if (!v) return "neu";
            return v.mo > 0 ? ("MO" + v.mo) : "";
        }

        sekce.forEach(sek => {
            const nove = [];
            sek.radky.forEach(r => {
                if (r.mo || r.neu || r.kat === KAT_ZAKOUZLENO || !r.zeme.length) { nove.push(r); return; }

                const skupiny = {}, poradi = [];
                r.zeme.forEach(jmeno => {
                    const klic = zarad(r, jmeno);
                    if (!skupiny[klic]) { skupiny[klic] = []; poradi.push(klic); }
                    skupiny[klic].push(jmeno);
                });
                if (poradi.length === 1 && poradi[0] === "") { nove.push(r); return; }

                poradi.forEach(klic => {
                    const zeme = skupiny[klic];
                    const moZeme = {};
                    zeme.forEach(jm => {
                        const k = normalizeText(jm);
                        if ((r.moZeme || {})[k]) moZeme[k] = r.moZeme[k];
                    });
                    nove.push(Object.assign({}, r, {
                        zeme: zeme, moZeme: moZeme,
                        mo: (klic === "" || klic === "neu") ? "" : klic,
                        neu: (klic === "neu")
                    }));
                });
            });
            sek.radky = nove;
        });
    }

    function parseML(text, ctx) {
        ctx = ctx || {};
        ctx.nejista = [];
        const sekce = [];
        let aktualni = { nazev: "", radky: [] };
        sekce.push(aktualni);
        const nezarazeno = [];

        let posledni = null;
        let hlavicka = null;

        let kouzloHlavicka = null;

        String(text || "").split(/\r?\n/).forEach(raw => {
            const line = raw.trim();
            if (!line) { posledni = null; kouzloHlavicka = null; return; }

            if (line.charAt(0) === "≈") return;

            if (!hlavicka) {
                const h = hlavickaML(line);
                if (h) { hlavicka = h; return; }
            } else if (hlavickaML(line)) {

                posledni = null;
                kouzloHlavicka = null;
                return;
            }

            const { stitek, telo, maDvojtecku } = parseMLLine(line);
            const { nasobek, zbytek } = vytahniNasobek(stitek);

            const proHledani = zbytek.replace(/!/g, " ").replace(/\s+/g, " ").trim();
            const kouzlo = stitek ? window.DarkElfUtils.Spells.byName(proHledani) : null;

            const spojena = stitek ? rozpadSpojeni(zbytek) : null;
            if (spojena) {
                const moStitu = vytahniMO(stitek);
                const prioStitu = maPrioritu(stitek);
                spojena.forEach(k => {
                    aktualni.radky.push({
                        kouzlo: k, stitekRaw: stitek, nasobek: 1, prio: prioStitu,
                        mo: moStitu, poznamka: "",
                        zeme: parseLands(telo), moZeme: moZeZavorek(telo)
                    });
                    const r = aktualni.radky[aktualni.radky.length - 1];
                    r.kat = katRadku(aktualni.nazev, r.prio, "");
                });

                posledni = null;
                return;
            }

            if (kouzlo) {
                aktualni.radky.push({
                    kouzlo: kouzlo,
                    stitekRaw: stitek,
                    nasobek: nasobek,
                    prio: maPrioritu(stitek),
                    mo: vytahniMO(kouzlo.zbytek) || vytahniMO(stitek),
                    neu: maNeu(stitek),
                    skmax: maSKmax(stitek),

                    poznamka: (kouzlo.zbytekRaw || kouzlo.zbytek)
                                           .replace(SLOVO_NEUTRALKA_RE, " ")
                                           .replace(PRIZNAK_NEU_RE, " ")
                                           .replace(PRIZNAK_SKMAX_RE, " ")
                                           .replace(VEZ_ZKRATKY_RE, " ")
                                           .replace(/mo\s*\d+(?:\s*-\s*\d+)?\s*\+?/i, "")
                                           .replace(/[\[\]()!]/g, "")
                                           .replace(/^[\s_-]+|[\s_-]+$/g, "")
                                           .replace(/\s+/g, " ").trim(),
                    zeme: parseLands(telo),
                    moZeme: moZeZavorek(telo)
                });
                posledni = aktualni.radky[aktualni.radky.length - 1];

                const majitel = majitelZemi(posledni.zeme, ctx.zemeIdx);

                const vZakouzleno = katZeSekce(aktualni.nazev) === KAT_ZAKOUZLENO;
                const rozdel = rozdelHraceAPoznamku(posledni.poznamka, jeHracskaSekce(aktualni.nazev),
                                                    ctx, majitel, !vZakouzleno);
                posledni.poznamka = rozdel.poznamka;
                posledni.kat = katRadku(aktualni.nazev, posledni.prio, rozdel.hrac);

                if (rozdel.hrac && posledni.kat === KAT_ZAKOUZLENO) {
                    posledni.poznamka = rozdel.poznamka
                        ? (rozdel.hrac + "= " + rozdel.poznamka)
                        : rozdel.hrac;
                }
                return;
            }

            const nadpis = ozdobnyNadpis(line) || (maDvojtecku ? null : holyNadpis(line));
            if (nadpis || (maDvojtecku && !telo)) {
                aktualni = { nazev: nadpis || stitek, radky: [] };
                sekce.push(aktualni);
                posledni = null;
                kouzloHlavicka = null;
                return;
            }

            if (!maDvojtecku) {
                const rozpad = kouzlaAPakZeme(line);
                if (rozpad && rozpad.zemeText.trim()) {
                    rozpad.kouzla.forEach(k => {
                        aktualni.radky.push({
                            kouzlo: k.kouzlo,
                            stitekRaw: line,
                            nasobek: k.nasobek,
                            prio: maPrioritu(line),
                            mo: rozpad.mo,
                            poznamka: "",
                            zeme: parseLands(rozpad.zemeText),
                            moZeme: moZeZavorek(rozpad.zemeText)
                        });
                        const r = aktualni.radky[aktualni.radky.length - 1];
                        r.kat = katRadku(aktualni.nazev, r.prio, "");
                    });

                    posledni = (rozpad.kouzla.length === 1)
                        ? aktualni.radky[aktualni.radky.length - 1] : null;
                    return;
                }
                if (rozpad && rozpad.kouzla.length === 1 && !rozpad.zemeText.trim()) {
                    kouzloHlavicka = { kouzlo: rozpad.kouzla[0].kouzlo,
                                       nasobek: rozpad.kouzla[0].nasobek,
                                       prio: maPrioritu(line) };
                    posledni = null;
                    return;
                }
            }

            if (!maDvojtecku) {
                const obraceny = zemeAPakKouzla(line, ctx.zemeIdx);
                if (obraceny) {
                    obraceny.kouzla.forEach(k => {
                        aktualni.radky.push({
                            kouzlo: k.kouzlo,
                            stitekRaw: line,
                            nasobek: k.nasobek,
                            prio: maPrioritu(line),
                            mo: "",
                            poznamka: "",
                            zeme: obraceny.zeme.slice(),
                            moZeme: {}
                        });
                        const r = aktualni.radky[aktualni.radky.length - 1];
                        r.kat = katRadku(aktualni.nazev, r.prio, "");
                    });

                    posledni = null;
                    return;
                }
            }

            const podHlavickou = kouzloHlavicka && !maDvojtecku && line.match(MO_ZA_KOUZLEM);
            if (podHlavickou) {
                const zbytekRadku = line.slice(podHlavickou[0].length);
                aktualni.radky.push({
                    kouzlo: kouzloHlavicka.kouzlo,
                    stitekRaw: line,
                    nasobek: kouzloHlavicka.nasobek,
                    prio: kouzloHlavicka.prio,
                    mo: vytahniMO(podHlavickou[1]),
                    poznamka: "",
                    zeme: parseLands(zbytekRadku),
                    moZeme: moZeZavorek(zbytekRadku)
                });
                posledni = aktualni.radky[aktualni.radky.length - 1];
                posledni.kat = katRadku(aktualni.nazev, posledni.prio, "");
                return;
            }

            if (!maDvojtecku && posledni) {
                parseLands(line).forEach(z => posledni.zeme.push(z));

                const dalsiMO = moZeZavorek(line);
                Object.keys(dalsiMO).forEach(k => { posledni.moZeme[k] = dalsiMO[k]; });
                return;
            }

            nezarazeno.push(line);
        });

        if (ctx.zemeIdx) {
            sekce.forEach(sek => sek.radky.forEach(r => {
                r.zeme = r.zeme.map(z => {
                    const nalez = ctx.zemeIdx[normalizeText(z)];
                    return (nalez && nalez.zeme) ? nalez.zeme : z;
                });
            }));
        }

        doplnNeutralky(sekce, ctx);

        sekce.forEach(sek => { sek.radky = slucRadky(sek.radky); });
        return { hlavicka: hlavicka, nejista: ctx.nejista,
                 sekce: sekce.filter(s => s.radky.length || s.nazev), nezarazeno: nezarazeno };
    }

    function cenaRadku(r, slevaPct) {
        const kusu = r.zeme.length * r.nasobek;
        const plna = kusu * r.kouzlo.cena;
        const sleva = window.DarkElfUtils.Spells.maSlevu(r.kouzlo.nazev) ? (slevaPct || 0) : 0;
        return { kusu: kusu, max: plna, min: Math.round(plna * (100 - sleva) / 100) };
    }

    function cz(n) { return (n || 0).toLocaleString("cs-CZ"); }

    const OKO_SRC = "/images/s/o.gif";

    function odkazNaMapu(idZeme) {
        const a = document.createElement("a");
        a.href = "mapa.asp?zeme=" + idZeme;
        a.target = "mapa";
        a.title = "Ukázat zem na mapě";
        a.style.cssText = "margin-right:4px;text-decoration:none;";
        const img = document.createElement("img");
        img.src = OKO_SRC;
        img.alt = "oko";
        img.style.cssText = "vertical-align:middle;";
        a.appendChild(img);
        return a;
    }

    function skAttrSafe(t) {
        return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function kouzloRadku(r) {
        if (!r) return null;
        if (r.kouzla && r.kouzla.length) return r.kouzla[0];
        return r.kouzlo || null;
    }

    function skupinaKouzla(r) {
        const k = kouzloRadku(r);
        return window.DarkElfUtils.Spells.kategorie(k ? k.nazev : "");
    }

    function klicMO(r) {
        const rozsah = moRozsah(r && r.mo);
        return rozsah ? rozsah.min : 0;
    }

    function seradVKategorii(radky) {
        return radky.slice().sort((a, b) => {
            const ka = skupinaKouzla(a), kb = skupinaKouzla(b);
            return (ka.skupina - kb.skupina) || (ka.poradi - kb.poradi) || (klicMO(a) - klicMO(b));
        });
    }

    function poradiProVystup(data) {
        const podleKat = {};
        const hraci = [];

        data.sekce.forEach(sek => {
            sek.radky.forEach(r => {
                const kat = r.kat || katRadku(sek.nazev, r.prio, "");
                if (!podleKat[kat]) {
                    podleKat[kat] = [];
                    if (KAT_PEVNE.indexOf(kat) === -1 && kat !== KAT_ZAKOUZLENO) hraci.push(kat);
                }
                podleKat[kat].push(r);
            });
        });

        const out = [];
        KAT_PEVNE.concat(hraci).concat([KAT_ZAKOUZLENO]).forEach(kat => {
            if (podleKat[kat] && podleKat[kat].length) {

                out.push({ nazev: kat, radky: seradVKategorii(slucRadky(podleKat[kat])) });
            }
        });
        return out;
    }

    function preskupit(data, jak, zemeIdx) {
        if (jak !== "hraci" && jak !== "mo") return poradiProVystup(data);

        const skupiny = {};
        const poradi = [];

        data.sekce.forEach(sek => {
            sek.radky.forEach(r => {
                const zakouzleno = (r.kat === KAT_ZAKOUZLENO);
                r.zeme.forEach(zem => {
                    let klic;
                    if (zakouzleno) {
                        klic = KAT_ZAKOUZLENO;
                    } else if (jak === "hraci") {
                        const z = zemeIdx && zemeIdx[normalizeText(zem)];
                        klic = (z && z.hrac) || "neznámý majitel";
                    } else {
                        klic = r.mo || "MO0";
                    }
                    if (!skupiny[klic]) { skupiny[klic] = []; poradi.push(klic); }
                    skupiny[klic].push({ kouzlo: r.kouzlo, mo: r.mo, poznamka: r.poznamka,
                                         nasobek: r.nasobek, prio: r.prio, kat: klic, zeme: [zem] });
                });
            });
        });

        const out = poradi.map(klic => ({ nazev: klic, radky: seradVKategorii(slucRadky(skupiny[klic])) }));

        const cisloMO = (t) => { const m = String(t).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };
        out.sort((a, b) => {
            if (a.nazev === KAT_ZAKOUZLENO) return 1;
            if (b.nazev === KAT_ZAKOUZLENO) return -1;
            if (jak === "mo") return cisloMO(a.nazev) - cisloMO(b.nazev);
            const pa = a.radky.reduce((n, r) => n + r.zeme.length, 0);
            const pb = b.radky.reduce((n, r) => n + r.zeme.length, 0);
            return pb - pa;
        });
        return out;
    }

    function poznamkaCena(souhrn) {
        if (!souhrn) return null;
        const d = new Date();
        const dvoj = (n) => (n < 10 ? "0" + n : String(n));
        const cas = d.getDate() + "." + (d.getMonth() + 1) + ". " + d.getHours() + ":" + dvoj(d.getMinutes());
        return "≈ orientační cena " + souhrn + " · " + cas;
    }

    const KOSE_MO = [20, 30, 40, 50, 100, 150, 200, 300, 400, 500, 1000];

    const PRAH_SESKUPENI = 3;

    function kosProMO(min) {

        if (!(min >= KOSE_MO[0])) return null;
        let kos = null;
        KOSE_MO.forEach(k => { if (min >= k) kos = k; });
        return kos;
    }

    const RODINA_STITY = ["Vojenský štít velký", "Vojenský štít", "Pás zmatení", "Magický štít velký", "Magický štít"];
    const RODINA_KLETBY = ["Dvojitá kletba", "Kletba", "Nespokojenost", "Krupobití", "Magický vír"];

    function rodinaKouzla(nazev) {
        if (RODINA_STITY.indexOf(nazev) > -1) return "stity";
        if (RODINA_KLETBY.indexOf(nazev) > -1) return "kletby";
        return null;
    }

    function poradiVRodine(nazev) {
        const r = rodinaKouzla(nazev);
        if (r === "stity") return RODINA_STITY.indexOf(nazev);
        if (r === "kletby") return RODINA_KLETBY.indexOf(nazev);
        return 0;
    }

    function rozpadSpojeni(stitek) {
        const t = String(stitek || "");
        if (t.indexOf("+") < 0) return null;

        const bezMO = t.replace(/mo\s*\d+(?:\s*-\s*\d+)?\s*\+?/i, " ").replace(/[!]/g, " ");

        const casti = bezMO.split("+")
            .map(c => c.replace(/^[\s_-]+|[\s_-]+$/g, ""))
            .filter(Boolean);
        if (casti.length < 2) return null;

        const kouzla = [];
        for (let i = 0; i < casti.length; i++) {
            const k = window.DarkElfUtils.Spells.byName(casti[i]);
            if (!k || k.zbytekRaw) return null;
            if (kouzla.some(x => x.nazev === k.nazev)) return null;
            kouzla.push(k);
        }
        return kouzla;
    }

    function spojRodiny(radky) {
        const spojitelny = (r) => !!rodinaKouzla(r.kouzlo.nazev) && r.nasobek === 1 && !r.poznamka;
        const klicem = (r) => [rodinaKouzla(r.kouzlo.nazev), r.mo || "",
                               r.prio ? "!" : "", r.zeme.join("")].join("|");

        const skupiny = {};
        radky.forEach(r => {
            if (!spojitelny(r)) return;
            const klic = klicem(r);
            if (!skupiny[klic]) skupiny[klic] = [];
            skupiny[klic].push(r);
        });

        const hotovo = {}, vysledek = [];
        radky.forEach(r => {
            if (!spojitelny(r)) { vysledek.push(r); return; }
            const klic = klicem(r);
            if (hotovo[klic]) return;
            hotovo[klic] = true;
            const skupina = skupiny[klic].slice().sort(
                (a, b) => poradiVRodine(a.kouzlo.nazev) - poradiVRodine(b.kouzlo.nazev));

            vysledek.push(Object.assign({}, skupina[0],
                { kouzla: skupina.map(x => x.kouzlo) }));
        });

        return vysledek;
    }

    function rozpadKose(radky) {
        const out = [];
        radky.forEach(r => {
            const rozsah = moRozsah(r.mo);
            const jeKos = !!rozsah && rozsah.max !== rozsah.min && rozsah.min >= KOSE_MO[0];
            if (!jeKos || r.zeme.length < 2) { out.push(r); return; }

            const podleMO = {}, zbytek = [];
            r.zeme.forEach(z => {
                const vlastni = (r.moZeme || {})[normalizeText(z)];
                if (!vlastni) { zbytek.push(z); return; }
                (podleMO[vlastni] = podleMO[vlastni] || []).push(z);
            });
            if (!Object.keys(podleMO).length) { out.push(r); return; }

            const kopie = (mo, zeme) => {
                const moZeme = {};
                zeme.forEach(z => { moZeme[normalizeText(z)] = mo; });
                return { kouzlo: r.kouzlo, kouzla: r.kouzla, mo: mo, poznamka: r.poznamka,
                         kat: r.kat, nasobek: r.nasobek, prio: r.prio,
                         zeme: zeme, moZeme: moZeme, poznamky: r.poznamky };
            };
            Object.keys(podleMO).forEach(mo => out.push(kopie(mo, podleMO[mo])));
            if (zbytek.length) out.push(kopie(r.mo, zbytek));
        });
        return out;
    }

    function seskupPoKosich(vstup) {
        const radky = rozpadKose(vstup);
        const skupiny = {}, poradi = [];
        radky.forEach(r => {
            const rozsah = moRozsah(r.mo);
            const min = rozsah ? rozsah.min : 0;

            const kos = kosProMO(min);
            if (kos == null) { poradi.push(r); return; }

            const klic = [r.kouzlo.nazev, r.poznamka || "", r.nasobek, r.prio ? "!" : "",
                          r.skmax ? "skmax" : "", kos].join("|");
            if (!skupiny[klic]) { skupiny[klic] = { kos: kos, radky: [] }; poradi.push(klic); }
            skupiny[klic].radky.push(r);
        });

        const out = [];
        poradi.forEach(klic => {
            if (typeof klic !== "string") { out.push(klic); return; }
            const sk = skupiny[klic];

            const seslani = sk.radky.reduce((n, r) => n + r.zeme.length, 0);
            if (seslani < PRAH_SESKUPENI) { sk.radky.forEach(r => out.push(r)); return; }

            if (sk.radky.length < 2) { sk.radky.forEach(r => out.push(r)); return; }

            const prvni = sk.radky[0];
            const zeme = [], moZeme = {};
            sk.radky.forEach(r => {
                r.zeme.forEach(z => {
                    const k = normalizeText(z);
                    if (zeme.indexOf(z) === -1) zeme.push(z);

                    moZeme[k] = (r.moZeme && r.moZeme[k]) || r.mo || "MO0";
                });
            });
            out.push({ kouzlo: prvni.kouzlo, mo: "MO" + sk.kos + "+", poznamka: prvni.poznamka,
                       kat: prvni.kat, nasobek: prvni.nasobek, prio: prvni.prio,
                       skmax: !!prvni.skmax,
                       zeme: zeme, moZeme: moZeme, poznamky: prvni.poznamky });
        });

        return seradVKategorii(out);
    }

    function kouzlaDoRoletky() {
        const S = window.DarkElfUtils.Spells;
        const polozky = Object.keys(S.LIST).map(nazev => {
            const k = S.kategorie(nazev);
            return { nazev: nazev, skupina: k.skupina, poradi: k.poradi, kat: k.nazev };
        });
        polozky.sort((a, b) => (a.skupina - b.skupina) || (a.poradi - b.poradi));

        const out = [];
        polozky.forEach(x => {
            if (!out.length || out[out.length - 1].kat !== x.kat) {
                out.push({ kat: x.kat, kouzla: [] });
            }
            out[out.length - 1].kouzla.push(x.nazev);
        });
        return out;
    }

    function rozpadPodleMO(radky) {
        const out = [];
        (radky || []).forEach(r => {
            const skupiny = {}, poradi = [];
            r.zeme.forEach(z => {
                const mo = (r.moZeme && r.moZeme[normalizeText(z)]) || r.mo || "";
                if (!skupiny[mo]) { skupiny[mo] = []; poradi.push(mo); }
                skupiny[mo].push(z);
            });
            if (poradi.length <= 1) { out.push(r); return; }

            poradi.sort((a, b) => (moRozsah(a) || { min: 0 }).min - (moRozsah(b) || { min: 0 }).min);
            poradi.forEach(mo => {
                const moZeme = {};
                skupiny[mo].forEach(z => { moZeme[normalizeText(z)] = mo; });
                out.push({ kouzlo: r.kouzlo, mo: mo, poznamka: r.poznamka, kat: r.kat,
                           nasobek: r.nasobek, prio: r.prio, zeme: skupiny[mo],
                           moZeme: moZeme, poznamky: r.poznamky });
            });
        });
        return out;
    }

    function exportML(data, cenaSouhrn, dnes) {
        const den = dnes || new Date();
        const hlavicka = "ML " + den.getDate() + "." + (den.getMonth() + 1) + ".";
        const radky = slozML(data, cenaSouhrn).split("\n");

        if (hlavickaML(radky[0])) {
            radky[0] = hlavicka;
            return radky.join("\n");
        }

        return hlavicka + "\n\n" + radky.join("\n");
    }

    function slozML(data, cenaSouhrn) {
        const radky = [];
        if (data.hlavicka) radky.push(data.hlavicka.text);
        let prvniSekce = true;
        poradiProVystup(data).forEach(sek => {
            if (sek.nazev) {
                if (radky.length) radky.push("");
                radky.push(sek.nazev + ":");
            } else if (!prvniSekce) {

                radky.push("");
            }
            prvniSekce = false;

            let minulaKat = null;
            spojRodiny(seskupPoKosich(sek.radky)).forEach(r => {
                const kat = skupinaKouzla(r).skupina;
                if (minulaKat !== null && kat !== minulaKat) radky.push("");
                minulaKat = kat;

                let stitek = (r.kouzla || [r.kouzlo])
                    .map(k => window.DarkElfUtils.Spells.zkratka(k.nazev)).join("+");
                if (r.mo) stitek += "_" + r.mo;

                else if (r.neu) stitek += "_neu";

                if (r.skmax) stitek += "_SKmax";
                if (r.poznamka) stitek += "_" + r.poznamka;
                if (r.nasobek > 1) stitek = r.nasobek + "×" + stitek;
                if (r.prio) stitek = "! " + stitek;

                const vypis = r.zeme.map(z => {
                    const mo = (r.moZeme || {})[normalizeText(z)];

                    if (!mo || mo === r.mo) return z;
                    return z + " (" + mo.replace(/^MO/, "") + ")";
                });
                radky.push(stitek + ":" + (vypis.length ? " " + vypis.join(",") : ""));
            });
        });

        if ((data.nezarazeno || []).length) {
            radky.push("");
            data.nezarazeno.forEach(line => radky.push(line));
        }

        const pozn = poznamkaCena(cenaSouhrn);
        if (pozn) { radky.push(""); radky.push(pozn); }
        return radky.join("\n");
    }

    function indexZemi(zeme) {
        const idx = {};
        (zeme || []).forEach(z => { if (z && z.zeme) idx[normalizeText(z.zeme)] = z; });
        return idx;
    }

    function pozadavekZeme(r, jmeno) {
        const zavorka = (r && r.moZeme) ? r.moZeme[normalizeText(jmeno)] : null;
        return moRozsah(zavorka || (r ? r.mo : ""));
    }

    function moRozsah(mo) {
        const m = String(mo || "").match(/^MO(\d+)(?:-(\d+))?(\+)?$/);
        if (!m) return null;
        const min = parseInt(m[1], 10);
        const max = (m[2] != null) ? parseInt(m[2], 10) : (m[3] ? Infinity : min);
        return { min: min, max: max };
    }

    const ODHAD_PROCENTNI = 50;
    const ODHAD_CHRAM = 200;

    function moZPrivate(z) {
        const p = z && z.private;

        if (!p || p.domu == null || p.doma_war3 == null) return null;
        const magu = parseInt(p.doma_war3, 10) || 0;
        const domu = parseInt(p.domu, 10) || 0;
        const vez = window.DarkElfUtils.parseTower(z.img_vez);
        const zaklad = (magu > 0 && domu > 0) ? (3 * magu * magu / domu) : 0;
        const mo = Math.floor(zaklad * (vez ? (vez.magMul || 1) : 1) + (vez ? (vez.magAdd || 0) : 0));
        return { jistota: "presna", mo: mo, vez: vez, zdroj: "private", magu: magu };
    }

    function moZeme(z, den) {

        const presna = moZPrivate(z);
        if (presna) return presna;

        const N = window.DarkElfUtils.NeutralAPI;
        if (N && N.jeNeutralka(z)) {
            const denZ = (den === undefined) ? denZMapy(null) : den;
            const v = N.mo(z, denZ);

            if (!v) return { jistota: "nezname", mo: null, vez: null,
                             zdroj: "neutralka", neutralka: true,
                             duvod: N.duvod(z, denZ) };
            return { jistota: "odhad", mo: v.mo, vez: v.vez, zdroj: "neutralka",
                     neutralka: true, magu: v.magu, domku: v.domku };
        }

        const vez = window.DarkElfUtils.parseTower(z.img_vez);
        const bezVojska = !z.land_power;
        const procentni = !!vez && vez.magMul > 1;

        if (procentni) {

            if (bezVojska) return { jistota: "presna", mo: 0, vez: vez };
            return { jistota: "odhad", vez: vez,
                     mo: (vez.key === "temple") ? ODHAD_CHRAM : ODHAD_PROCENTNI };
        }
        const pevna = vez ? vez.magAdd : 0;
        return bezVojska
            ? { jistota: "presna", mo: pevna, vez: vez }
            : { jistota: "spodni", mo: pevna, vez: vez };
    }

    function escapeRe(t) {
        return String(t == null ? "" : t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function najdiVText(text, hledane) {
        const out = [];
        const casti = String(hledane || "").trim().split(/\s+/).map(escapeRe).filter(Boolean);
        if (!casti.length) return out;
        const radky = String(text || "").split("\n");
        let pozice = 0;
        radky.forEach((radek, i) => {
            const re = new RegExp(casti.join("\\s+"), "gi");
            let m;
            while ((m = re.exec(radek))) {

                const dalsi = radek.charAt(m.index + m[0].length);
                if (dalsi && /[^\W\d_]/u.test(dalsi)) continue;
                out.push({ radek: i + 1, textRadku: radek,
                           od: pozice + m.index, do: pozice + m.index + m[0].length,
                           odVRadku: m.index, doVRadku: m.index + m[0].length });
                break;
            }
            pozice += radek.length + 1;
        });
        return out;
    }

    function chybejiciCarka(jmeno, idx) {
        if (!idx) return null;
        const slova = String(jmeno || "").trim().split(/\s+/).filter(Boolean);
        if (slova.length < 2) return null;

        const nalezena = [];
        for (let i = 1; i < slova.length; i++) {
            const a = slova.slice(0, i).join(" ");
            const b = slova.slice(i).join(" ");
            const zemA = idx[normalizeText(a)];
            const zemB = idx[normalizeText(b)];
            if (zemA && zemB) nalezena.push([zemA.zeme || a, zemB.zeme || b]);
        }
        return (nalezena.length === 1) ? nalezena[0] : null;
    }

    function chybyZapisu(data, idx, text, cast, vyresene) {
        const nalezy = [];
        const nenalezeno = (co) => [{ radek: 0, textRadku: co, od: 0, do: 0, odVRadku: 0, doVRadku: 0 }];

        if (idx) {
            const videne = {};
            data.sekce.forEach(sek => sek.radky.forEach(r => r.zeme.forEach(jmeno => {
                const klic = normalizeText(jmeno);
                if (idx[klic] || videne[klic]) return;
                videne[klic] = true;

                const carka = chybejiciCarka(jmeno, idx);

                const popis = carka
                    ? ("chybí čárka? → " + carka.join(","))
                    : "zem neznám";
                const kde = najdiVText(text, jmeno);
                (kde.length ? kde : nenalezeno(jmeno)).forEach(k => {
                    nalezy.push({ druh: "zem", popis: popis, cast: jmeno,
                                  navrh: carka || null,
                                  radek: k.radek, textRadku: k.textRadku, od: k.od, do: k.do,
                                  odVRadku: k.odVRadku, doVRadku: k.doVRadku });
                });
            })));
        }

        if (idx && cast) {
            kontrolaOs(data, cast, idx).forEach(n => {
                if (n.druh !== "konflikt") return;
                if (vyresene && vyresene[klicOsy(n)]) return;
                const zkr = window.DarkElfUtils.Spells.zkratka(n.kouzlo);

                const kde = najdiVText(text, n.zeme);
                const k = (kde.length ? kde : nenalezeno(n.zeme))[0];
                nalezy.push({
                    druh: "osa", cast: n.zeme, osaNalez: n,

                    popis: "letí " + n.zdroje.join(", ") + ", list chce " + zkr
                           + " — co je omyl? (jinak " + Math.abs(n.zbyva) + "×)",
                    radek: k.radek, textRadku: k.textRadku, od: k.od, do: k.do,
                    odVRadku: k.odVRadku, doVRadku: k.doVRadku });
            });
        }

        (data.nezarazeno || []).forEach(line => {
            const kde = najdiVText(text, line);
            const k = (kde.length ? kde : nenalezeno(line))[0];
            nalezy.push({ druh: "radek", popis: "nepoznal jsem kouzlo", cast: line,
                          radek: k.radek, textRadku: k.textRadku, od: k.od, do: k.do,
                          odVRadku: k.odVRadku, doVRadku: k.doVRadku });
        });

        nalezy.sort((a, b) => (a.radek - b.radek) || (a.od - b.od));
        return nalezy;
    }

    function otazkyKRozhodnuti(data, text) {
        return (data.nejista || []).map(n => {
            const kde = najdiVText(text, n.text);
            const k = kde.length ? kde[0]
                : { radek: 0, textRadku: n.text, od: 0, do: 0,
                    odVRadku: 0, doVRadku: String(n.text).length };
            return { klic: n.klic, text: n.text, kandidati: n.kandidati || [],
                     popis: "hráč, nebo poznámka?",
                     radek: k.radek, textRadku: k.textRadku, od: k.od, do: k.do,
                     odVRadku: k.odVRadku, doVRadku: k.doVRadku };
        });
    }

    function kontrolaMO(data, idx, den) {
        const nesedi = [], neznameZeme = [], neovereno = [];
        let ok = 0;

        data.sekce.forEach(sek => {
            sek.radky.forEach(r => {

                r.zeme.forEach(jmeno => {
                    const rozsah = pozadavekZeme(r, jmeno) || { min: 0, max: 0, implicitni: true };
                    const z = idx[normalizeText(jmeno)];
                    if (!z) { neznameZeme.push(jmeno); return; }

                    const stav = moZeme(z, den);

                    if (stav.neutralka && r.kat === KAT_ZAKOUZLENO) { ok++; return; }

                    const haj = (r.kouzlo.typ === "cervene" && parseInt(z.id_rasa, 10) === 10) ? 10 : 0;

                    const vezPopis = (stav.neutralka
                            ? ("neobsazená země · spočítáno z " + stav.magu + " mágů a "
                               + stav.domku + " domů")
                            : ((stav.vez ? (stav.vez.cz + " +" + (stav.vez.magAdd || 0)) : "žádná věž")
                               + (stav.zdroj === "private" ? (" · spočítáno z " + stav.magu + " mágů doma") : "")))
                        + (haj ? " + magický háj +10 (entí zem)" : "");

                    if (stav.jistota === "nezname" || stav.mo == null) {
                        neovereno.push({ zeme: z.zeme, id: z.id,
                                         duvod: stav.neutralka
                                             ? popisDuvoduNeu(stav.duvod)
                                             : ((stav.vez ? stav.vez.cz : "věž") + " — nespočítám") });
                        return;
                    }

                    const cekano = stav.mo + haj;
                    const presne = (stav.jistota === "presna");

                    const bezVojskaPopis = (presne && stav.zdroj !== "private") ? ", bez vojska" : "";

                    const podceneno = rozsah.max < cekano;
                    const nadhodnoceno = !!stav.neutralka && rozsah.min > cekano;
                    if (podceneno || nadhodnoceno) {

                        const plus = (presne || stav.neutralka) ? "" : "+";
                        nesedi.push({ zeme: z.zeme, id: z.id, vListu: r.mo || "bez MO (= 0)", mapa: cekano, radek: r, sekce: sek,
                                      navrh: "MO" + cekano + plus,
                                      smer: nadhodnoceno ? "nad" : "pod",
                                      duvod: vezPopis + bezVojskaPopis,
                                      popis: vezPopis + (stav.neutralka
                                          ? (" → MO je " + cekano
                                             + (nadhodnoceno ? ", v listu je víc (zbytečná mana)" : ""))
                                          : (presne
                                              ? (bezVojskaPopis + " → MO je přesně " + cekano)
                                              : (stav.jistota === "odhad"
                                                  ? (" s vojskem → dohodou bereme aspoň " + cekano)
                                                  : (" → MO nemůže být pod " + cekano)))) });
                    } else ok++;
                });
            });
        });

        return { nesedi: nesedi, neznameZeme: neznameZeme, ok: ok, neovereno: neovereno };
    }

    const PRAH_PREKOUZLENI = 5;

    function zakladProPrah(pozadavek, stav) {
        return Math.max(pozadavek || 0, (stav && stav.mo != null) ? stav.mo : 0);
    }

    function navrhyZakouzleno(data, cast, idx) {
        const out = [];
        jizZakouzlenoVPlanu(data, cast, idx).forEach(n => {
            const v = vyhodnotSeslani(n, idx, prahSKmaxSily(cast));
            const typ = v.typ, pozadavek = v.pozadavek, stav = v.stav;

            if (!v.splnil) return;

            if (n.pocet < n.potreba) return;

            if (v.jisteOdrazeno) return;

            const jiste = v.jisteProslo;

            const zaklad = zakladProPrah(pozadavek, stav);
            const rezerva = zaklad > 0 && n.sila >= PRAH_PREKOUZLENI * zaklad;

            const kam = v.slaboProSKmax ? KAT_JISTOTA : KAT_ZAKOUZLENO;
            if (n.radek.kat === kam) return;

            out.push({ zeme: n.zeme, id: n.id, kouzlo: n.kouzlo, sila: n.sila, kouzlic: n.kouzlic,
                       radek: n.radek, sekce: n.sekce, kam: kam, pozadavek: pozadavek,
                       mapa: stav ? stav.mo : null,
                       popis: jiste
                           ? ("síla " + n.sila + " > MO " + stav.mo + " — prošlo")
                           : (typ === "zlute"
                               ? ("žluté kouzlo — síla " + n.sila + " splnila požadavek MO" + pozadavek
                                  + ", a žlutému stačí půlka obrany")
                               : (rezerva
                                   ? ("síla " + n.sila + " je aspoň " + PRAH_PREKOUZLENI
                                      + "× MO" + zaklad + " — překouzlovat nemá co zlepšit")
                                   : ("síla " + n.sila + " splnila požadavek MO" + pozadavek
                                      + (stav && stav.mo != null ? (", ale MO odhadujeme na " + stav.mo) : "")))) });
        });
        return out;
    }

    function kouzlaZFormulare(doc) {
        const pocty = {}, poradi = [];
        for (let i = 1; i <= 5; i++) {
            const sel = doc.getElementById("K" + i);
            if (!sel || sel.selectedIndex < 0) continue;
            const volba = sel.options[sel.selectedIndex];
            const text = String((volba && volba.text) || "").replace(/\([^)]*\)\s*$/, "").trim();
            if (!text) continue;
            const kouzlo = window.DarkElfUtils.Spells.byName(text);
            if (!kouzlo || kouzlo.zbytek) continue;
            if (!pocty[kouzlo.nazev]) { pocty[kouzlo.nazev] = 0; poradi.push(kouzlo.nazev); }
            pocty[kouzlo.nazev]++;
        }
        return poradi.map(n => ({ nazev: n, typ: window.DarkElfUtils.Spells.LIST[n].typ,
                                  nasobek: pocty[n] }));
    }

    function spocitejFormular(doc) {
        const ta = doc.getElementById("textAreaMagic");
        const zeme = parseLands(ta ? ta.value : "");
        const polozky = [], poradi = [], pocty = {};
        let cenaZaKolo = 0, neznamaCena = false;

        for (let i = 1; i <= 5; i++) {
            const sel = doc.getElementById("K" + i);
            if (!sel || sel.selectedIndex < 0) continue;
            const volba = sel.options[sel.selectedIndex];
            const text = String((volba && volba.text) || "").trim();

            if (!text || String(sel.value) === "0") continue;

            const holy = text.replace(/\([^)]*\)\s*$/, "").trim();
            const kouzlo = window.DarkElfUtils.Spells.byName(holy);
            const nazev = (kouzlo && !kouzlo.zbytek) ? kouzlo.nazev : holy;
            if (!pocty[nazev]) { pocty[nazev] = 0; poradi.push(nazev); }
            pocty[nazev]++;

            const zaKus = cenaZOption(volba);
            if (zaKus == null) neznamaCena = true; else cenaZaKolo += zaKus;
        }

        poradi.forEach(n => polozky.push({ nazev: n, nasobek: pocty[n] }));
        const cena = (neznamaCena || !polozky.length) ? null : cenaZaKolo * zeme.length;
        const mana = aktualniMana();
        return { polozky: polozky, zeme: zeme, cena: cena, mana: mana,
                 zbude: (cena != null && mana != null) ? (mana - cena) : null };
    }

    function navrhZFormulare(kouzla, zeme, idx) {
        const out = [];
        kouzla.forEach(k => {
            const podleMO = {}, poradi = [];
            zeme.forEach(jmeno => {
                const z = idx ? idx[normalizeText(jmeno)] : null;
                const stav = z ? moProTyp(z, k.typ) : null;

                const pevna = stav && (stav.jistota === "presna" || stav.neutralka);
                const mo = (stav && stav.mo != null)
                    ? ("MO" + stav.mo + (pevna ? "" : "+"))
                    : "";
                if (!podleMO[mo]) { podleMO[mo] = []; poradi.push(mo); }
                podleMO[mo].push(jmeno);
            });
            poradi.forEach(mo => {
                out.push({ kouzlo: k.nazev, typ: k.typ, nasobek: k.nasobek,
                           mo: mo, zeme: podleMO[mo] });
            });
        });
        return out;
    }

    function najdiRadekZeme(data, kouzloNazev, jmeno) {
        const cil = normalizeText(jmeno);
        let out = null;
        ((data && data.sekce) || []).forEach(sek => sek.radky.forEach(r => {
            if (out || !r.kouzlo || r.kouzlo.nazev !== kouzloNazev) return;
            for (let i = 0; i < r.zeme.length; i++) {
                if (normalizeText(r.zeme[i]) === cil) { out = { radek: r, sekce: sek }; return; }
            }
        }));
        return out;
    }

    function souhrnClenu(cast) {
        const out = ((cast && cast.clenove) || []).map(c => ({
            jmeno: c.jmeno,
            zbyva: Math.max(0, (c.celkem || 0) - (c.seslano || 0)),
            silaMin: c.silaMin || 0,
            silaMax: c.silaMax || 0
        }));
        out.sort((a, b) => ((b.zbyva > 0) - (a.zbyva > 0))
                           || (b.silaMax - a.silaMax)
                           || (b.zbyva - a.zbyva));
        return out;
    }

    function vyhodnotSeslani(n, idx, prahSK) {
        const typ = n.radek.kouzlo.typ;
        const pozadavek = (pozadavekZeme(n.radek, n.zeme) || { min: 0 }).min;
        const z = idx ? idx[normalizeText(n.zeme)] : null;
        const stav = z ? moProTyp(z, typ) : null;
        const presne = !!stav && stav.jistota === "presna" && stav.mo != null;
        const projde = !!stav && stav.mo != null && projdeObranou(n.sila, stav.mo, typ);

        const slaboProSKmax = !!n.radek.skmax && prahSK > 0 && n.sila < prahSK;

        return { typ: typ, pozadavek: pozadavek, stav: stav,
                 prahSK: prahSK || 0,
                 slaboProSKmax: slaboProSKmax,
                 splnil: projdeObranou(n.sila, pozadavek, typ),
                 jisteOdrazeno: presne && !projde,
                 jisteProslo: presne && projde };
    }

    function dodaneKroky(cast, zemeId, pozadavek) {
        const S = window.DarkElfUtils.Spells;
        const out = { osy: { porodnost: 0, zlato: 0, mana: 0 }, drzi: {}, leci: {}, zdroje: [] };

        ((cast && cast.kouzla) || []).forEach(k => {
            if (k.zemeId !== zemeId) return;
            if (pozadavek > 0 && k.sila != null && !projdeObranou(k.sila, pozadavek, k.typ)) return;

            const kroky = S.kroky(k.kouzlo);
            if (kroky) {
                Object.keys(kroky).forEach(osa => { out.osy[osa] += kroky[osa]; });
                out.zdroje.push(k.kouzlo);
            }
            (S.DRZI_OSU[k.kouzlo] || []).forEach(osa => { out.drzi[osa] = k.kouzlo; });
            (S.LECI_OSU[k.kouzlo] || []).forEach(osa => { out.leci[osa] = k.kouzlo; });
        });
        return out;
    }

    function slucOsy(nalezy) {
        const skupiny = {}, poradi = [];
        (nalezy || []).forEach(n => {
            const klic = [n.id, n.kouzlo, n.druh, n.pozadovano, n.zbyva, n.popis].join("|");
            if (!skupiny[klic]) {
                skupiny[klic] = Object.assign({}, n, { osy: [] });
                poradi.push(klic);
            }
            skupiny[klic].osy.push(n.osa);
        });
        return poradi.map(k => skupiny[k]);
    }

    function kontrolaOs(data, cast, idx) {
        const S = window.DarkElfUtils.Spells;
        const nalezy = [];

        ((data && data.sekce) || []).forEach(sek => sek.radky.forEach(r => {
            if (r.kat === KAT_ZAKOUZLENO) return;
            const kroky = S.kroky(r.kouzlo.nazev);
            if (!kroky) return;

            r.zeme.forEach(jmeno => {
                const z = idx[normalizeText(jmeno)];
                if (!z) return;
                const pozadavek = (pozadavekZeme(r, jmeno) || { min: 0 }).min;
                const dodano = dodaneKroky(cast, z.id, pozadavek);

                Object.keys(kroky).forEach(osa => {
                    const pozadovano = kroky[osa] * (r.nasobek || 1);
                    const jizDodano = dodano.osy[osa];

                    if (dodano.drzi[osa]) {
                        nalezy.push({ zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev, osa: osa,
                                      druh: "drzi", pozadovano: pozadovano, zbyva: 0, radek: r,
                                      popis: dodano.drzi[osa] + " drží " + osa + " — tenhle krok nic neudělá" });
                        return;
                    }

                    if (dodano.leci[osa] && pozadovano < 0) {
                        nalezy.push({ zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev, osa: osa,
                                      druh: "leci", pozadovano: pozadovano, zbyva: 0, radek: r,
                                      popis: dodano.leci[osa] + " " + osa + " vyléčí — tenhle krok nic neudělá" });
                        return;
                    }

                    if (!jizDodano) return;

                    if ((jizDodano > 0) !== (pozadovano > 0)) {
                        nalezy.push({ zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev, osa: osa,
                                      druh: "konflikt", pozadovano: pozadovano,
                                      dodano: jizDodano, zdroje: dodano.zdroje.slice(),
                                      zbyva: pozadovano - jizDodano, radek: r, sekce: sek,
                                      popis: "na zem letí " + dodano.zdroje.join(", ")
                                             + " — táhne " + osa + " opačně" });
                        return;
                    }

                    const zbyva = pozadovano - jizDodano;
                    const uzStaci = (pozadovano > 0) ? (zbyva <= 0) : (zbyva >= 0);
                    if (uzStaci || Math.abs(zbyva) < Math.abs(pozadovano)) {
                        nalezy.push({ zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev, osa: osa,
                                      druh: uzStaci ? "netreba" : "mene",
                                      pozadovano: pozadovano, dodano: jizDodano,
                                      zdroje: dodano.zdroje.slice(),
                                      zbyva: uzStaci ? 0 : zbyva, radek: r,
                                      popis: dodano.zdroje.join(", ") + " už letí" });
                    }
                });
            });
        }));

        return nalezy;
    }

    function neprosleVPlanu(data, cast, idx) {
        const out = [];
        jizZakouzlenoVPlanu(data, cast, idx).forEach(n => {
            const v = vyhodnotSeslani(n, idx, prahSKmaxSily(cast));

            const maloSeslani = n.pocet < n.potreba;
            if (v.splnil && !maloSeslani && !v.jisteOdrazeno) return;
            out.push({ zeme: n.zeme, id: n.id, kouzlo: n.kouzlo, sila: n.sila,
                       kouzlic: n.kouzlic, pozadavek: v.pozadavek,
                       pocet: n.pocet, potreba: n.potreba,
                       mapa: v.jisteOdrazeno ? v.stav.mo : null,

                       duvod: !v.splnil ? "list" : (v.jisteOdrazeno ? "mapa" : "pocet") });
        });
        return out;
    }

    function kontrolaZakouzleno(data, cast, idx) {
        const seslani = seslaniPodleZeme(cast);
        const nalezy = [];
        let potvrzeno = 0, celkem = 0;

        ((data && data.sekce) || []).forEach(sek => {
            sek.radky.forEach(r => {
                if (r.kat !== KAT_ZAKOUZLENO) return;
                r.zeme.forEach(jmeno => {
                    const z = idx ? idx[normalizeText(jmeno)] : null;
                    if (!z || z.id == null) return;
                    celkem++;

                    const spolecne = { zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev,
                                       radek: r, sekce: sek, kam: KAT_VYCHOZI };
                    const seznam = seslani[z.id + "|" + r.kouzlo.nazev] || [];
                    if (!seznam.length) {
                        nalezy.push(Object.assign({ sila: null, kouzlic: null,
                                                    pozadavek: null, duvod: "chybi" }, spolecne));
                        return;
                    }
                    potvrzeno++;

                    const pozadavek = (pozadavekZeme(r, jmeno) || { min: 0 }).min;
                    const proslo = seznam.filter(x => projdeObranou(x.sila, pozadavek, r.kouzlo.typ));
                    const nej = seznam.reduce((a, b) => (b.sila > a.sila ? b : a));
                    if (!proslo.length) {
                        nalezy.push(Object.assign({ sila: nej.sila, kouzlic: nej.kouzlic,
                                                    pozadavek: pozadavek, duvod: "list" }, spolecne));
                        return;
                    }

                    const potreba = r.nasobek || 1;
                    if (proslo.length >= potreba) return;
                    nalezy.push(Object.assign({ sila: nej.sila, kouzlic: nej.kouzlic,
                                                pozadavek: pozadavek, pocet: proslo.length,
                                                potreba: potreba, duvod: "pocet" }, spolecne));
                });
            });
        });
        return { nalezy: nalezy, potvrzeno: potvrzeno, celkem: celkem };
    }

    function jeCiziList(souhrn) {
        return !!souhrn && souhrn.celkem > 0 && souhrn.potvrzeno === 0;
    }

    function idsZListu(data, idx) {
        const out = {};
        if (!data || !idx) return out;
        data.sekce.forEach(sek => sek.radky.forEach(r => r.zeme.forEach(jmeno => {
            const z = idx[normalizeText(jmeno)];
            if (z && z.id != null) out[z.id] = true;
        })));
        return out;
    }

    function presunKategorii(nalezy) {
        const dotcene = [], sekce = [];
        nalezy.forEach(n => {
            const jm = normalizeText(n.zeme);
            n.radek.zeme = n.radek.zeme.filter(z => normalizeText(z) !== jm);

            n.sekce.radky.push({ kouzlo: n.radek.kouzlo, mo: n.radek.mo, poznamka: n.radek.poznamka,
                                 kat: n.kam, nasobek: n.radek.nasobek, prio: false,
                                 skmax: !!n.radek.skmax, neu: !!n.radek.neu, zeme: [n.zeme] });
            if (dotcene.indexOf(n.radek) === -1) dotcene.push(n.radek);
            if (sekce.indexOf(n.sekce) === -1) sekce.push(n.sekce);
        });
        sekce.forEach(sek => {
            sek.radky = slucRadky(sek.radky.filter(r => r.zeme.length || dotcene.indexOf(r) === -1));
        });
    }

    function presunZeme(polozky) {
        const dotcene = [], sekce = [];
        (polozky || []).forEach(p => {
            const jm = normalizeText(p.zeme);
            p.radek.zeme = p.radek.zeme.filter(z => normalizeText(z) !== jm);
            if (p.radek.moZeme) delete p.radek.moZeme[jm];
            if (!p.smazat) {
                p.sekce.radky.push({
                    kouzlo: p.kouzlo || p.radek.kouzlo,
                    mo: (p.mo !== undefined) ? p.mo : p.radek.mo,
                    poznamka: p.radek.poznamka, kat: p.radek.kat,
                    nasobek: (p.nasobek !== undefined) ? p.nasobek : p.radek.nasobek,

                    skmax: !!p.radek.skmax, neu: !!p.radek.neu,
                    prio: p.radek.prio, zeme: [p.zeme], moZeme: {} });
            }
            if (dotcene.indexOf(p.radek) === -1) dotcene.push(p.radek);
            if (sekce.indexOf(p.sekce) === -1) sekce.push(p.sekce);
        });
        sekce.forEach(sek => {
            sek.radky = slucRadky(sek.radky.filter(r => r.zeme.length || dotcene.indexOf(r) === -1));
        });
    }

    function zvysNasobek(nalezy) {
        presunZeme((nalezy || [])
            .filter(n => Math.abs(n.zbyva))
            .map(n => ({ zeme: n.zeme, radek: n.radek, sekce: n.sekce,
                         nasobek: Math.abs(n.zbyva) })));
    }

    function opravMO(nalezy) {
        presunZeme((nalezy || [])
            .map(n => ({ zeme: n.zeme, radek: n.radek, sekce: n.sekce, mo: n.navrh })));
    }

    function indexZemiPodleId(zeme) {
        const idx = {};
        (zeme || []).forEach(z => { if (z && z.id != null) idx[z.id] = z; });
        return idx;
    }

    function moProTyp(z, typ) {
        const stav = moZeme(z);
        const haj = (typ === "cervene" && parseInt(z.id_rasa, 10) === 10) ? 10 : 0;
        const popis = (stav.vez ? (stav.vez.cz + " +" + (stav.vez.magAdd || 0)) : "žádná věž")
            + (stav.zdroj === "private" ? (" · spočítáno z " + stav.magu + " mágů doma") : "")
            + (haj ? " + háj +10" : "");
        return { jistota: stav.jistota, mo: (stav.mo == null ? null : stav.mo + haj),
                 neutralka: !!stav.neutralka, popis: popis };
    }

    function projdeObranou(sila, mo, typ) {
        return (typ === "zlute") ? (sila > mo / 2) : (sila > mo);
    }

    const PRAH_SANCE = 0.5;

    function nejnizsiSK(mo, typ) {
        return Math.floor((typ === "zlute") ? (mo / 2) : mo) + 1;
    }

    function sanceNaSeslani(mo, typ, sk) {
        if (!sk || sk.min == null || sk.max == null || sk.max < sk.min) return null;
        const celkem = sk.max - sk.min + 1;
        if (celkem <= 0) return null;
        const projde = sk.max - Math.max(nejnizsiSK(mo, typ), sk.min) + 1;
        return Math.max(0, Math.min(1, projde / celkem));
    }

    function stupenSance(sance) {
        if (sance == null) return null;
        if (sance >= 1) return "jistota";
        return (Math.round(sance * 100) < PRAH_SANCE * 100) ? "nemacenu" : "hranicni";
    }

    function popisSance(mo, typ, sk) {
        const sance = sanceNaSeslani(mo, typ, sk);
        const stupen = stupenSance(sance);
        if (!stupen || stupen === "jistota") return "";
        return "Šance " + Math.round(sance * 100) + " % — potřeba SK aspoň " + nejnizsiSK(mo, typ)
            + ", tvoje SK je " + sk.min + "–" + sk.max
            + ((stupen === "nemacenu") ? ". Nejspíš zbytečná mana." : "");
    }

    function mojeSKZeSeznamu(cast, hlavicka) {
        const clenove = (cast && cast.clenove) || [];
        if (!clenove.length || !hlavicka) return null;
        const id = String(hlavicka.id_hrace == null ? "" : hlavicka.id_hrace);
        const jmeno = normalizeText(hlavicka.hrac || "");
        let ja = id ? clenove.filter(c => String(c.id) === id)[0] : null;
        if (!ja && jmeno) ja = clenove.filter(c => normalizeText(c.jmeno) === jmeno)[0];
        if (!ja || !ja.silaMax) return null;
        return { min: ja.silaMin || Math.round(ja.silaMax / 3), max: ja.silaMax };
    }

    function moZeListu(data, idx) {
        const out = {};
        if (!data || !idx) return out;
        data.sekce.forEach(sek => sek.radky.forEach(r => {
            r.zeme.forEach(jmeno => {
                const rozsah = pozadavekZeme(r, jmeno);
                if (!rozsah) return;
                const z = idx[normalizeText(jmeno)];
                if (!z || z.id == null) return;
                if (out[z.id] == null || out[z.id] < rozsah.min) out[z.id] = rozsah.min;
            });
        }));
        return out;
    }

    function kontrolaSily(cast, idxId, moListu) {
        const odrazi = [], nejiste = [], neovereno = [], neznameZeme = [];
        let projde = 0;

        ((cast && cast.kouzla) || []).forEach(k => {
            const z = idxId[k.zemeId];
            if (!z) { neznameZeme.push(k.zeme); return; }

            const stav = moProTyp(z, k.typ);
            if (stav.jistota === "nezname" || stav.mo == null) {
                neovereno.push({ zeme: k.zeme, id: k.zemeId, duvod: stav.popis + " — nespočítám" });
                return;
            }

            let mo = stav.mo, jistota = stav.jistota, popis = stav.popis;
            const zListu = moListu ? moListu[k.zemeId] : null;
            if (zListu != null && zListu > mo) {
                mo = zListu; jistota = "odhad";
                popis = stav.popis + " · v listu máš MO " + zListu;
            }

            const zaznam = { zeme: k.zeme, id: k.zemeId, kouzlo: k.kouzlo, typ: k.typ,
                             sila: k.sila, mo: mo, kouzlic: k.kouzlic, cil: k.cil };

            if (!projdeObranou(k.sila, mo, k.typ)) {
                zaznam.popis = popis + " → MO " + mo + ", síla " + k.sila
                    + (k.typ === "zlute" ? " (žluté, stačí víc než polovina)" : "");

                (jistota === "odhad" ? nejiste : odrazi).push(zaznam);
            } else if (jistota === "presna") {
                projde++;
            } else {

                zaznam.popis = popis + " → MO aspoň " + mo + ", vojsko ji může zvednout";
                nejiste.push(zaznam);
            }
        });

        return { odrazi: odrazi, nejiste: nejiste, projde: projde,
                 neovereno: neovereno, neznameZeme: neznameZeme };
    }

    function duplicityVAlianci(cast) {
        const podle = {}, poradi = [];
        ((cast && cast.kouzla) || []).forEach(k => {
            const klic = k.zemeId + "|" + k.kouzlo;
            if (!podle[klic]) { podle[klic] = { zeme: k.zeme, id: k.zemeId, kouzlo: k.kouzlo, kdo: [] }; poradi.push(klic); }
            podle[klic].kdo.push(k.kouzlic);
        });
        return poradi.map(k => podle[k]).filter(x => {
            const ruzni = x.kdo.filter((j, i) => x.kdo.indexOf(j) === i);
            return ruzni.length > 1;
        });
    }

    function seslaniPodleZeme(cast) {
        const mapa = {};
        ((cast && cast.kouzla) || []).forEach(k => {
            const klic = k.zemeId + "|" + k.kouzlo;
            (mapa[klic] = mapa[klic] || []).push(k);
        });
        return mapa;
    }

    function nejsilnejsiSeslani(cast) {
        const hotovo = {};
        ((cast && cast.kouzla) || []).forEach(k => {
            const klic = k.zemeId + "|" + k.kouzlo;
            const dosud = hotovo[klic];
            if (!dosud || k.sila > dosud.sila) hotovo[klic] = k;
        });
        return hotovo;
    }

    function poradiSpotreby(data) {
        const vsechny = [];
        ((data && data.sekce) || []).forEach(sek => {
            sek.radky.forEach(r => {
                vsechny.push({ r: r, sek: sek,
                               kat: r.kat || katRadku(sek.nazev, r.prio, "") });
            });
        });
        const vaha = kat => {
            const i = KAT_PEVNE.indexOf(kat);
            if (i > -1) return i;
            if (kat === KAT_ZAKOUZLENO) return 999;
            return 500;
        };

        return vsechny
            .map((x, i) => ({ x: x, i: i }))
            .sort((a, b) => (vaha(a.x.kat) - vaha(b.x.kat))
                         || ((b.x.r.prio ? 1 : 0) - (a.x.r.prio ? 1 : 0))
                         || (a.i - b.i))
            .map(o => o.x);
    }

    function jizZakouzlenoVPlanu(data, cast, idx) {
        const seslani = seslaniPodleZeme(cast);

        const zbyva = {};
        Object.keys(seslani).forEach(k => {
            zbyva[k] = seslani[k].slice().sort((a, b) => b.sila - a.sila);
        });

        const nalezy = [];
        poradiSpotreby(data).forEach(polozka => {
            const r = polozka.r, sek = polozka.sek;
            if (r.kat === KAT_ZAKOUZLENO) return;
            r.zeme.forEach(jmeno => {
                const z = idx[normalizeText(jmeno)];
                if (!z) return;
                const pool = zbyva[z.id + "|" + r.kouzlo.nazev];
                if (!pool || !pool.length) return;
                const potreba = r.nasobek || 1;
                const vzato = pool.splice(0, potreba);

                const pozadavek = (pozadavekZeme(r, jmeno) || { min: 0 }).min;
                const proslo = vzato.filter(k => projdeObranou(k.sila, pozadavek, r.kouzlo.typ));

                const nej = vzato.reduce((a, b) => (b.sila > a.sila ? b : a));
                nalezy.push({ zeme: jmeno, id: z.id, kouzlo: r.kouzlo.nazev,
                              kouzlic: nej.kouzlic, sila: nej.sila,
                              pocet: proslo.length, potreba: potreba,
                              radek: r, sekce: sek });
            });
        });
        return nalezy;
    }

    function optionKouzla(sel, nazev) {
        const norm = window.DarkElfUtils.Spells.norm.bind(window.DarkElfUtils.Spells);
        const cil = norm(nazev);
        for (let i = 0; i < sel.options.length; i++) {
            const holy = String(sel.options[i].text || "").replace(/\s*\(\d+\)\s*$/, "");
            if (norm(holy) === cil) return sel.options[i];
        }
        return null;
    }

    function cenaZOption(opt) {
        const m = String(opt && opt.text || "").match(/\((\d+)\)\s*$/);
        return m ? parseInt(m[1], 10) : null;
    }

    function aktualniMana() {
        try {
            for (let i = 0; i < window.parent.frames.length; i++) {
                try {
                    const el = window.parent.frames[i].document.getElementById("i2");
                    if (el) {
                        const n = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10);
                        if (!isNaN(n)) return n;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    function pripravKouzleni(r) {
        const ta = document.getElementById("textAreaMagic");
        const sely = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById("K" + i);
            if (el) sely.push(el);
        }
        if (!ta || !sely.length) return null;

        const opt = optionKouzla(sely[0], r.kouzlo.nazev);
        if (!opt) return { chyba: "kouzlo „" + r.kouzlo.nazev + "\" v roletce není (umí ho jiná rasa?)" };

        const kolik = Math.min(r.nasobek, sely.length);
        sely.forEach((sel, i) => {
            sel.value = (i < kolik) ? opt.value : "0";
            sel.dispatchEvent(new Event("change", { bubbles: true }));
        });

        ta.value = r.zeme.join(",");
        ["input", "keyup", "change"].forEach(ev => ta.dispatchEvent(new Event(ev, { bubbles: true })));

        const zaKus = cenaZOption(opt);
        const cena = (zaKus == null) ? null : zaKus * r.zeme.length * kolik;
        const mana = aktualniMana();
        return { cena: cena, zaKus: zaKus, kolik: kolik, mana: mana,
                 zbude: (cena != null && mana != null) ? (mana - cena) : null };
    }

    function nactiRozhodnuti() {
        try { return JSON.parse(localStorage.getItem(odecLigaKlic("jmena"))) || {}; }
        catch (e) { return {}; }
    }
    function ulozRozhodnuti(r) {
        try { localStorage.setItem(odecLigaKlic("jmena"), JSON.stringify(r)); } catch (e) {}
    }

    function nactiRozhodnutiOs() {
        try { return JSON.parse(localStorage.getItem(odecLigaKlic("osy"))) || {}; }
        catch (e) { return {}; }
    }
    function ulozRozhodnutiOs(r) {
        try { localStorage.setItem(odecLigaKlic("osy"), JSON.stringify(r)); } catch (e) {}
    }
    function klicOsy(n) {
        return n.id + "|" + n.kouzlo + "|" + n.osa;
    }

    function nactiPohled() {
        try { return localStorage.getItem(odecLigaKlic("pohled")) || "priority"; }
        catch (e) { return "priority"; }
    }

    const OKNO_ID = "ml_nalezy_okno";

    const ROLETKA_STYL = "background:#3a0f0a;color:#ffcc66;";

    function vsechnyRamy() {
        const out = [window];
        try {
            const ramy = (window.parent && window.parent.frames) ? window.parent.frames : [];
            for (let i = 0; i < ramy.length; i++) {
                try {
                    if (ramy[i] && ramy[i].document && out.indexOf(ramy[i]) === -1) out.push(ramy[i]);
                } catch (e) { }
            }
        } catch (e) { }
        return out;
    }

    function ramProOkno() {
        let nej = window, nejPlocha = 0;
        vsechnyRamy().forEach(w => {
            try {
                if (!w.document || !w.document.body) return;
                const plocha = (w.innerWidth || 0) * (w.innerHeight || 0);
                if (plocha > nejPlocha) { nej = w; nejPlocha = plocha; }
            } catch (e) { }
        });
        return nej;
    }

    function zavriOkno() {
        vsechnyRamy().forEach(w => {
            try {
                const el = w.document.getElementById(OKNO_ID);
                if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (e) { }
        });
    }

    function najdiOkno() {
        let out = null;
        vsechnyRamy().forEach(w => {
            try {
                const el = w.document.getElementById(OKNO_ID);
                if (el && !out) out = el;
            } catch (e) { }
        });
        return out;
    }

    function otevriOkno(nalezy, vstupEl, otazky, sluzby) {
        nalezy = nalezy || [];
        otazky = otazky || [];
        sluzby = sluzby || {};

        let scrollBylo = 0;
        try { const stary = najdiOkno(); if (stary) scrollBylo = stary.scrollTop || 0; } catch (e) { }

        zavriOkno();
        if (!nalezy.length && !otazky.length) return;

        const ram = ramProOkno();
        const doc = ram.document;
        const sirkaRamu = ram.innerWidth || 700;
        const sirka = Math.max(240, Math.min(640, sirkaRamu - 24));
        const leva = Math.max(8, Math.round((sirkaRamu - sirka) / 2));
        const maxVyska = Math.max(120, Math.round((ram.innerHeight || 400) * 0.7));

        const okno = doc.createElement("div");
        okno.id = OKNO_ID;
        const hostStyl = {
            "position": "fixed", "left": leva + "px", "top": "14px",
            "width": sirka + "px", "height": "auto", "max-height": maxVyska + "px",
            "overflow": "auto", "box-sizing": "border-box", "display": "block",
            "margin": "0", "padding": "8px 10px", "float": "none",
            "z-index": "2147483000", "background": "#1a1208",
            "border": "1px solid #553311", "border-radius": "3px",
            "font-family": "Arial, sans-serif", "font-size": "12px", "color": "#ddd",
            "box-shadow": "0 4px 14px rgba(0,0,0,0.6)"
        };
        Object.keys(hostStyl).forEach(k => okno.style.setProperty(k, hostStyl[k], "important"));

        let koren = okno;
        try { koren = okno.attachShadow({ mode: "open" }); } catch (e) { koren = okno; }

        const zaklad = "position:static;float:none;width:auto;height:auto;box-sizing:border-box;";

        if (koren !== okno) {
            const styl = doc.createElement("style");
            styl.textContent = ":host{all:initial;} div,span,a{" + zaklad + "}";
            koren.appendChild(styl);
        }

        const krizek = doc.createElement("a");
        krizek.href = "#";
        krizek.textContent = "✕";
        krizek.style.cssText = zaklad + "position:absolute;right:8px;top:6px;width:14px;"
            + "color:#996655;text-decoration:none;font-size:13px;cursor:pointer;";
        krizek.onclick = (e) => { e.preventDefault(); zavriOkno(); };
        koren.appendChild(krizek);

        const hlava = doc.createElement("div");
        hlava.style.cssText = zaklad + "color:#cc9944;font-weight:bold;margin-bottom:3px;padding-right:18px;";
        hlava.textContent = "Magic list — " + (otazky.length + nalezy.length) + " k vyřešení";
        koren.appendChild(hlava);

        const nadpisSekce = (text, barva, oddelit) => {
            const d = doc.createElement("div");
            d.style.cssText = zaklad + "color:" + barva + ";font-weight:bold;"
                + (oddelit ? "margin-top:10px;padding-top:6px;border-top:1px solid #553311;" : "");
            d.textContent = text;
            koren.appendChild(d);
        };

        const napovedaSekce = (text) => {
            const d = doc.createElement("div");
            d.style.cssText = zaklad + "color:#888;margin-bottom:6px;padding-right:18px;";
            d.textContent = text;
            koren.appendChild(d);
        };

        const radekListu = (n) => {
            const r = doc.createElement("div");
            r.style.cssText = zaklad + "margin:3px 0;padding:2px 6px;cursor:pointer;line-height:1.45;"
                + "border-left:2px solid #553311;overflow-wrap:break-word;color:#ddd;";
            r.title = "Označit v poli s ML";

            const cislo = doc.createElement("span");
            cislo.style.cssText = zaklad + "display:inline;color:#777;margin-right:6px;";
            cislo.textContent = n.radek ? ("ř. " + n.radek) : "?";
            r.appendChild(cislo);

            r.appendChild(doc.createTextNode(n.textRadku.slice(0, n.odVRadku)));
            const zvyr = doc.createElement("span");
            zvyr.style.cssText = zaklad + "display:inline;color:#ff8866;font-weight:bold;";
            zvyr.textContent = n.textRadku.slice(n.odVRadku, n.doVRadku);
            r.appendChild(zvyr);
            r.appendChild(doc.createTextNode(n.textRadku.slice(n.doVRadku)));

            const jdeOpravit = (n.navrh && sluzby.opravZem)
                || (n.druh === "osa" && n.osaNalez && sluzby.zvysNasobek);
            const duvod = doc.createElement(jdeOpravit ? "a" : "span");
            duvod.style.cssText = zaklad + "display:inline;margin-left:8px;white-space:nowrap;"
                + (jdeOpravit
                    ? "color:#cc9944;text-decoration:underline dotted;cursor:pointer;"
                    : "color:#996655;");
            duvod.textContent = "— " + n.popis;
            if (jdeOpravit) {
                duvod.href = "#";
                duvod.title = (n.druh === "osa")
                    ? "Nastavit násobek tak, aby to pokrylo i to, co letí proti"
                    : "Doplnit čárku a přechroustat znovu";
                duvod.onclick = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (n.druh === "osa") sluzby.zvysNasobek(n); else sluzby.opravZem(n);
                };
            }
            r.appendChild(duvod);

            r.onclick = () => {
                try {
                    vstupEl.focus();
                    vstupEl.setSelectionRange(n.od, (n.do > n.od) ? n.do : n.od);

                    const radku = Math.max(1, vstupEl.value.split("\n").length);
                    const vyska = vstupEl.scrollHeight / radku;
                    vstupEl.scrollTop = Math.max(0, (n.radek - 2) * vyska);
                } catch (e) { }
                r.style.background = "#2a1c0c";
            };
            return r;
        };

        const ovladaniOtazky = (o) => {
            const d = doc.createElement("div");
            d.style.cssText = zaklad + "margin:0 0 7px 8px;padding-left:6px;color:#ddd;";

            const jm = doc.createElement("span");
            jm.style.cssText = zaklad + "display:inline;color:#ffcc66;margin-right:6px;";
            jm.textContent = "„" + o.text + "“";
            d.appendChild(jm);

            const kandidati = o.kandidati || [];
            const nabidka = kandidati.concat(
                (sluzby.hraci || []).filter(h => kandidati.indexOf(h) === -1));

            if (nabidka.length) {
                const vyber = doc.createElement("select");
                vyber.style.cssText = zaklad + "display:inline;font-size:11px;max-width:160px;"
                    + "border:1px solid #553311;" + ROLETKA_STYL;
                const prazdna = doc.createElement("option");
                prazdna.value = "";
                prazdna.textContent = "— je to hráč: vyber —";
                prazdna.style.cssText = ROLETKA_STYL + "color:#cc9944;";
                vyber.appendChild(prazdna);

                nabidka.forEach(h => {
                    const op = doc.createElement("option");
                    op.value = h; op.textContent = h;
                    op.style.cssText = ROLETKA_STYL;
                    vyber.appendChild(op);
                });
                vyber.onchange = () => {
                    if (vyber.value && sluzby.naHrace) sluzby.naHrace(o.klic, vyber.value);
                };
                d.appendChild(vyber);
            } else {
                const jeHrac = doc.createElement("a");
                jeHrac.href = "#";
                jeHrac.textContent = "je to hráč";
                jeHrac.style.cssText = zaklad + "display:inline;color:#cc9944;text-decoration:none;";
                jeHrac.onclick = (ev) => {
                    ev.preventDefault();
                    if (sluzby.naHrace) sluzby.naHrace(o.klic, "");
                };
                d.appendChild(jeHrac);
            }

            const nebo = doc.createElement("span");
            nebo.style.cssText = zaklad + "display:inline;color:#888;margin:0 6px;";
            nebo.textContent = "nebo";
            d.appendChild(nebo);

            const pozn = doc.createElement("a");
            pozn.href = "#";
            pozn.textContent = "je to poznámka";
            pozn.style.cssText = zaklad + "display:inline;color:#cc9944;text-decoration:none;";
            pozn.onclick = (ev) => {
                ev.preventDefault();
                if (sluzby.naPoznamku) sluzby.naPoznamku(o.klic);
            };
            d.appendChild(pozn);
            return d;
        };

        if (otazky.length) {
            nadpisSekce("❓ Potřebuju rozhodnout (" + otazky.length + ")", "#ffcc66", false);
            napovedaSekce("Jméno hráče se z listu zahazuje, poznámka u řádku zůstane. "
                          + "Odpověď si pamatuju.");
            otazky.forEach(o => {
                koren.appendChild(radekListu(o));
                koren.appendChild(ovladaniOtazky(o));
            });

            if (sluzby.zapomen) {
                const zapomen = doc.createElement("a");
                zapomen.href = "#";
                zapomen.textContent = "zapomenout uložená rozhodnutí";
                zapomen.style.cssText = zaklad + "display:inline-block;color:#996655;"
                    + "text-decoration:none;font-size:10px;";
                zapomen.onclick = (ev) => { ev.preventDefault(); sluzby.zapomen(); };
                koren.appendChild(zapomen);
            }
        }

        if (nalezy.length) {
            nadpisSekce("✎ Tohle jsem nepobral (" + nalezy.length + ")", "#cc9944", otazky.length > 0);
            napovedaSekce("Klikni na nález — označí se ti v poli s ML. Oprav a dej znovu Přechroustat.");
            nalezy.forEach(n => koren.appendChild(radekListu(n)));
        }

        doc.body.appendChild(okno);
        try { okno.scrollTop = scrollBylo; } catch (e) { }
    }

    function addPrehledML() {
        const box = document.getElementById("odec_box");
        if (!box || document.getElementById("ml_telo")) return;

        const hlavicka = document.createElement("a");
        hlavicka.href = "#";
        hlavicka.style.cssText = "display:block;color:#cc9944;text-decoration:none;padding:2px 0;";
        hlavicka.textContent = "▸ Přehled magic listu";

        const telo = document.createElement("div");
        telo.id = "ml_telo";
        telo.style.display = "none";

        const poleStyl = "width:94%;font-family:Arial;font-size:11px;color:yellow;margin:2px 0;";

        const vstup = document.createElement("textarea");
        vstup.id = "ml_vstup";
        vstup.className = "edit_big";
        vstup.rows = 5;
        vstup.style.cssText = poleStyl;
        vstup.title = "Vlep sem celý magic list, jak ho máte.";

        const tlacitko = document.createElement("button");
        tlacitko.className = "butt_sml";
        tlacitko.textContent = "Přechroustat";
        tlacitko.style.cssText = "margin:6px 0 4px 0;padding:3px 14px;cursor:pointer;";

        const obnovit = document.createElement("button");
        obnovit.className = "butt_sml";
        obnovit.textContent = "⟳";
        obnovit.title = "Načíst znovu alianční kouzla a přesunout, co mezitím někdo zakouzlil";
        obnovit.style.cssText = "margin:6px 0 4px 4px;padding:3px 8px;cursor:pointer;";

        const smazat = document.createElement("button");
        smazat.className = "butt_sml";
        smazat.textContent = "✕";
        smazat.title = "Smazat načtený ML a začít nanovo";
        smazat.style.cssText = "margin:6px 0 4px 4px;padding:3px 8px;cursor:pointer;";

        const vystup = document.createElement("div");
        vystup.id = "ml_vystup";
        vystup.style.cssText = "font-size:11px;color:#ccc;max-width:100%;overflow-wrap:break-word;";

        const kopirovat = document.createElement("button");
        kopirovat.className = "butt_sml";
        kopirovat.textContent = "Kopírovat zpět do ML";
        kopirovat.style.cssText = "margin:4px 0;padding:3px 10px;cursor:pointer;display:none;";

        const zpetnyText = document.createElement("textarea");
        zpetnyText.id = "ml_zpet";
        zpetnyText.className = "edit_big";
        zpetnyText.rows = 4;
        zpetnyText.style.cssText = "width:94%;font-family:Arial;font-size:11px;color:#9c9;margin:2px 0;display:none;";
        zpetnyText.title = "Uklizený magic list ve zkratkách — pošli zpátky do společného.";

        const stavKouzleni = document.createElement("div");
        stavKouzleni.id = "ml_kouzleni";
        stavKouzleni.style.cssText = "font-size:11px;margin:3px 0;padding:3px;display:none;"
            + "border-left:3px solid #cc9944;background:rgba(204,153,68,0.08);";

        telo.appendChild(vstup);
        telo.appendChild(tlacitko);
        telo.appendChild(obnovit);
        telo.appendChild(smazat);
        telo.appendChild(vystup);
        telo.appendChild(zpetnyText);
        telo.appendChild(kopirovat);
        box.appendChild(hlavicka);
        box.appendChild(telo);

        try {
            if (nactiHotovy()) { telo.style.display = "block"; hlavicka.textContent = "▾ Přehled magic listu"; }
        } catch (e) {}

        hlavicka.onclick = (e) => {
            e.preventDefault();
            const skryto = telo.style.display === "none";
            telo.style.display = skryto ? "block" : "none";
            hlavicka.textContent = (skryto ? "▾" : "▸") + " Přehled magic listu";
            if (skryto) obnovUlozene();
        };

        kopirovat.onclick = (e) => {
            e.preventDefault();
            zpetnyText.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (er) {}
            if (!ok && navigator.clipboard) {
                navigator.clipboard.writeText(zpetnyText.value).then(
                    () => { kopirovat.textContent = "Zkopírováno ✓"; },
                    () => { kopirovat.textContent = "Nešlo — zkopíruj ručně"; }
                );
                return;
            }
            kopirovat.textContent = ok ? "Zkopírováno ✓" : "Nešlo — zkopíruj ručně";
            setTimeout(() => { kopirovat.textContent = "Kopírovat zpět do ML"; }, 2500);
        };

        const stav = { data: null, sleva: { nejlepsi: 0, moje: 0, dostupne: false }, idx: null, idxId: null,
                       hraci: null, cast: null, mojeSK: null,
                       rozhodnuti: nactiRozhodnuti(), rozhodnutiOs: nactiRozhodnutiOs(),
                       pohled: nactiPohled(), rucni: null, presunuto: [],
                       zFormulare: null };

        function otevriOknoTed() {
            if (!stav.data) return;
            otevriOkno(chybyZapisu(stav.data, stav.idx, vstup.value, stav.cast, stav.rozhodnutiOs), vstup,
                       otazkyKRozhodnuti(stav.data, vstup.value), {
                hraci: stav.hraci || [],
                naHrace: (klic, jmeno) => {
                    stav.rozhodnuti[klic] = { typ: "hrac", jmeno: jmeno || "" };
                    poRozhodnuti();
                },
                naPoznamku: (klic) => {
                    stav.rozhodnuti[klic] = { typ: "poznamka" };
                    poRozhodnuti();
                },
                zapomen: () => {
                    stav.rozhodnuti = {};
                    stav.rozhodnutiOs = {};
                    ulozRozhodnutiOs(stav.rozhodnutiOs);
                    poRozhodnuti();
                },

                zvysNasobek: (n) => {
                    if (!n || !n.osaNalez) return;
                    zvysNasobek([n.osaNalez]);
                    stav.rozhodnutiOs[klicOsy(n.osaNalez)] = true;
                    ulozRozhodnutiOs(stav.rozhodnutiOs);
                    vykresli();
                    ulozHotovy(zpetnyText.value);
                    otevriOknoTed();
                },
                opravZem: (n) => {
                    if (!n || !n.navrh) return;
                    const puvodni = vstup.value;
                    const nahrada = n.navrh.join(",");
                    if (puvodni.slice(n.od, n.do) !== n.cast) return;
                    vstup.value = puvodni.slice(0, n.od) + nahrada + puvodni.slice(n.do);
                    try { localStorage.setItem(odecLigaKlic("ml"), vstup.value); } catch (e) { }
                    stav.data = parseML(vstup.value, { hraci: stav.hraci, zemeIdx: stav.idx,
                                                       rozhodnuti: stav.rozhodnuti });
                    presunHotove();
                    vykresli();
                    ulozHotovy(zpetnyText.value);
                    otevriOknoTed();
                }
            });
        }

        function poRozhodnuti() {
            ulozRozhodnuti(stav.rozhodnuti);
            vykresli(true);
            otevriOknoTed();
        }

        function vykresli(znovuParsovat) {
            if (znovuParsovat) {
                stav.data = parseML(vstup.value, { hraci: stav.hraci, zemeIdx: stav.idx, rozhodnuti: stav.rozhodnuti });

                stav.rucni = null;
            }
            vystup.innerHTML = "";

            if (stav.zFormulare) vykresliZFormulare();
            if (!stav.data) return;

            if (stav.data.hlavicka) {
                const h = stav.data.hlavicka;
                const dnes = new Date();
                const sedi = (h.den === dnes.getDate()) && (h.mesic === (dnes.getMonth() + 1));
                const d = document.createElement("div");
                d.style.cssText = "margin-bottom:4px;color:" + (sedi ? "#88bb66" : "#ff8866") + ";";
                d.textContent = sedi
                    ? (h.text + " — datum sedí")
                    : (h.text + " ⚠ dnes je " + dnes.getDate() + "." + (dnes.getMonth() + 1) + ". — je to včerejší list?");
                vystup.appendChild(d);
            }

            let celkemMin = 0, celkemMax = 0, celkemZemi = 0;

            let rezervaMin = 0, rezervaMax = 0, rezervaZemi = 0;
            let hotovoZemi = 0;

            const tab = document.createElement("table");
            tab.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;";
            let rucniVykreslen = false;

            const prepinac = document.createElement("div");
            prepinac.style.cssText = "margin:2px 0;color:#777;";
            prepinac.appendChild(document.createTextNode("řadit: "));
            [["priority", "priority"], ["hraci", "hráči"], ["mo", "MO"]].forEach((v, i) => {
                if (i) prepinac.appendChild(document.createTextNode(" · "));
                const a = document.createElement("a");
                a.href = "#";
                a.textContent = v[1];
                const aktivni = (stav.pohled === v[0]);
                a.style.cssText = "text-decoration:none;color:" + (aktivni ? "#cc9944" : "#888") + ";"
                    + (aktivni ? "font-weight:bold;" : "");
                a.onclick = (ev) => {
                    ev.preventDefault();
                    stav.pohled = v[0];
                    try { localStorage.setItem(odecLigaKlic("pohled"), v[0]); } catch (e) {}
                    vykresli();
                };
                prepinac.appendChild(a);
            });
            vystup.appendChild(prepinac);

            preskupit(stav.data, stav.pohled, stav.idx).forEach(sek => {

                const hotovo = (sek.nazev === KAT_ZAKOUZLENO);
                const rezerva = (sek.nazev === KAT_JISTOTA);

                if (sek.nazev) {
                    const trH = document.createElement("tr");
                    const tdH = document.createElement("td");
                    tdH.colSpan = 2;
                    tdH.style.cssText = "padding:5px 0 1px 0;font-weight:bold;color:"
                        + (hotovo ? "#777" : (rezerva ? "#99aa88" : "#cc9944")) + ";";
                    tdH.textContent = sek.nazev;
                    if (rezerva) {
                        tdH.title = "Řádky s `_SKmax` si řekly o seslání nejsilnější SK "
                            + "v alianci, ale dodaná síla nedosáhla prahu. Sešli znovu silněji, "
                            + "až zbude mana a limit.";
                    }
                    trH.appendChild(tdH);
                    tab.appendChild(trH);
                }

                (hotovo ? sek.radky : rozpadPodleMO(sek.radky)).forEach(r => {
                    const c = cenaRadku(r, stav.sleva.nejlepsi);
                    if (hotovo) { hotovoZemi += c.kusu; }
                    else if (rezerva) { rezervaMin += c.min; rezervaMax += c.max; rezervaZemi += c.kusu; }
                    else { celkemMin += c.min; celkemMax += c.max; celkemZemi += c.kusu; }

                    const tr = document.createElement("tr");

                    const neuPopis = r.neu
                        ? r.zeme.map(jm => moznostiNeu(jm, stav.idx ? stav.idx[normalizeText(jm)] : null,
                                                       denZMapy(null)))
                                .filter(Boolean)
                        : [];
                    tr.title = r.zeme.join(", ")
                        + ((r.poznamky && r.poznamky.length) ? ("\n\npoznámky: " + r.poznamky.join(" · ")) : "")
                        + (neuPopis.length ? ("\n\n" + neuPopis.join("\n")) : "");

                    const tdK = document.createElement("td");
                    tdK.style.cssText = "vertical-align:top;padding:1px 4px 1px 4px;width:46%;"
                        + "border-left:2px solid "
                        + (hotovo ? "#555" : (r.kouzlo.typ === "zlute" ? "#EEBB11" : "#CC3322")) + ";"
                        + (hotovo ? "color:#888;" : "");

                    const klicRadku = r.kouzlo.nazev + "|" + (r.mo || "") + "|" + r.nasobek;
                    if (!hotovo) {
                        tdK.style.cssText += "cursor:pointer;";
                        tdK.title = "Klikni: upravit řádek (MO, kouzlo, počet seslání, země)";
                        tdK.onclick = () => {
                            stav.rucni = (stav.rucni && stav.rucni.klic === klicRadku)
                                ? null
                                : { klic: klicRadku, kouzlo: r.kouzlo, mo: r.mo,
                                    nasobek: r.nasobek, zeme: r.zeme.slice(), smazane: [] };
                            vykresli();
                        };
                    }
                    const zkratka = window.DarkElfUtils.Spells.zkratka(r.kouzlo.nazev);
                    tdK.textContent = (r.prio ? "❗ " : "")
                        + zkratka.charAt(0).toUpperCase() + zkratka.slice(1)
                        + (r.nasobek > 1 ? " " + r.nasobek + "×" : "")
                        + (r.mo ? " " + r.mo : "")
                        + (r.skmax ? " SKmax" : "")
                        + (r.poznamka ? " (" + r.poznamka + ")" : "");

                    if (!hotovo && r.skmax && stav.mojeSK && stav.cast) {
                        const smim = zpusobilySKmax(stav.mojeSK.max, stav.cast);
                        const nutno = prahSKmaxSily(stav.cast);
                        tdK.style.cssText += smim ? "color:#aaffaa;font-weight:bold;" : "color:#888;";

                        tdK.title = (smim
                                ? ("Tohle můžeš seslat ty — tvoje SK " + stav.mojeSK.max
                                   + " je v 80% rozptylu nejsilnějšího v alianci.")
                                : "Chce to někoho silnějšího (80 % nejvyšší SK v alianci).")
                            + (nutno ? ("\nHotové to bude až sesláním nad " + nutno
                                        + " — pod tím to zůstane v „Pro jistotu překouzlit"
                                        + " s větší SK“, protože síla seslání je náhodná.") : "")
                            + "\nManu členů nevidíme, jen zbývající kouzla."
                            + (tdK.title ? ("\n" + tdK.title) : "");
                    }

                    if (!hotovo && stav.mojeSK) {
                        const moRadku = (moRozsah(r.mo) || { min: 0 }).min;
                        const stupen = stupenSance(
                            sanceNaSeslani(moRadku, r.kouzlo.typ, stav.mojeSK));
                        if (stupen && stupen !== "jistota") {
                            tdK.style.cssText += (stupen === "nemacenu")
                                ? "color:#777;" : "color:#ff8866;";
                            const popis = popisSance(moRadku, r.kouzlo.typ, stav.mojeSK);
                            tdK.title = popis + (tdK.title ? ("\n" + tdK.title) : "");
                        }
                    }

                    const tdZ = document.createElement("td");
                    tdZ.style.cssText = "vertical-align:top;padding:1px 0;"
                        + (hotovo ? "color:#888;" : "");

                    const pocet = document.createElement(hotovo ? "span" : "a");
                    pocet.textContent = r.zeme.length + " zemí";
                    if (!hotovo) {
                        pocet.href = "#";
                        pocet.title = "Naložit do kouzlení (kouzlo do K1…K5, země do herní buňky)";
                        pocet.style.cssText = "color:#ddd;text-decoration:underline dotted;cursor:pointer;";
                        pocet.onclick = (ev) => {
                            ev.preventDefault();
                            const v = pripravKouzleni(r);
                            stavKouzleni.style.display = "block";
                            if (!v) {
                                stavKouzleni.textContent = "Nenašel jsem herní formulář (roletky K1…K5).";
                                return;
                            }
                            if (v.chyba) { stavKouzleni.textContent = v.chyba; return; }

                            prekresliFormular("Zkontroluj a dej „Seslat na napsané země“.");
                        };
                    }

                    const cenaEl = document.createElement("span");
                    cenaEl.style.cssText = "color:#88aadd;";
                    cenaEl.textContent = " · " + ((c.min === c.max) ? cz(c.max) : (cz(c.min) + "–" + cz(c.max)));

                    tdZ.appendChild(pocet);
                    tdZ.appendChild(cenaEl);

                    tr.appendChild(tdK);
                    tr.appendChild(tdZ);
                    tab.appendChild(tr);

                    if (!hotovo && stav.rucni && stav.rucni.klic === klicRadku) {
                        rucniVykreslen = true;
                        const trE = document.createElement("tr");
                        const tdE = document.createElement("td");
                        tdE.colSpan = 2;
                        tdE.style.cssText = "padding:0;";
                        tdE.appendChild(vykresliRucniMO());
                        trE.appendChild(tdE);
                        tab.appendChild(trE);
                    }
                });
            });
            vystup.appendChild(tab);

            if (stav.rucni && !rucniVykreslen) vystup.appendChild(vykresliRucniMO());

            const souhrn = document.createElement("div");
            souhrn.style.cssText = "margin-top:6px;padding-top:4px;border-top:1px solid #553311;color:#ddd;";

            const seslano = hotovoZemi + rezervaZemi;
            souhrn.innerHTML = "<b>Sesláno " + seslano + "/" + (seslano + celkemZemi) + "</b>"
                + " · zbývá <b>" + celkemZemi + "</b> · <b>"
                + ((celkemMin === celkemMax) ? cz(celkemMax) : (cz(celkemMin) + "–" + cz(celkemMax)))
                + " many</b>";
            vystup.appendChild(souhrn);

            if (rezervaZemi) {
                const r2 = document.createElement("div");
                r2.style.cssText = "color:#99aa88;";
                r2.title = "Zakouzleno podle požadavku, ale MO nemusí sedět. Sešli znovu "
                    + "s maximální SK, když zbude mana a limit kouzel.";
                r2.textContent = "Pro jistotu: " + rezervaZemi + " seslání · "
                    + ((rezervaMin === rezervaMax) ? cz(rezervaMax) : (cz(rezervaMin) + "–" + cz(rezervaMax)))
                    + " many navíc";
                vystup.appendChild(r2);
            }

            souhrn.title = "Počítají se seslání, ne země: 2× na čtyřech zemích = 8 seslání."
                + " Sesláno = Zakouzleno" + (rezervaZemi ? " + pro jistotu" : "")
                + ". Cena je jen za to, co zbývá.\n\n"
                + (stav.sleva.dostupne
                ? ("Rozptyl = nejlepší sleva v alianci " + stav.sleva.nejlepsi + " % … bez slevy."
                   + (stav.sleva.moje ? " Tvoje sleva " + stav.sleva.moje + " %." : " Ty slevu nemáš.")
                   + " Sleva platí jen na žlutá kouzla.")
                : "Alianční data nejsou načtená → cena je BEZ slevy.");

            if (stav.idx) vykresliKontroluMO();
            if (stav.cast) vykresliAliancni();

            if (stav.data.nejista && stav.data.nejista.length) {
                const kolik = stav.data.nejista.length;
                const upoz = document.createElement("a");
                upoz.href = "#";
                upoz.style.cssText = "display:block;margin-top:6px;padding-top:4px;"
                    + "border-top:1px solid #553311;color:#ffcc66;text-decoration:none;";
                upoz.textContent = "⚠ " + kolik + " "
                    + (kolik === 1 ? "věc čeká" : (kolik < 5 ? "věci čekají" : "věcí čeká"))
                    + " na rozhodnutí — otevřít";
                upoz.onclick = (ev) => { ev.preventDefault(); otevriOknoTed(); };
                vystup.appendChild(upoz);
            }

            if (stav.data.nezarazeno.length) {
                const nez = document.createElement("div");
                nez.style.cssText = "color:#996655;margin-top:4px;";
                nez.textContent = "Nezařazeno (nepoznal jsem kouzlo): " + stav.data.nezarazeno.join(" | ");
                vystup.appendChild(nez);
            }

            const souhrnCeny = celkemZemi + " seslání · "
                + ((celkemMin === celkemMax) ? cz(celkemMax) : (cz(celkemMin) + "–" + cz(celkemMax)))
                + " many";
            zpetnyText.value = exportML(stav.data, souhrnCeny);
            zpetnyText.style.display = "block";
            kopirovat.style.display = "inline-block";
            kopirovat.textContent = "Kopírovat zpět do ML";
        }

        function vykresliZFormulare() {
            const navrhy = stav.zFormulare;
            const blok = document.createElement("div");
            blok.style.cssText = "margin:2px 0 6px 0;padding-bottom:4px;border-bottom:1px solid #553311;";

            const nadpis = document.createElement("div");
            nadpis.style.cssText = "color:#cc9944;";
            nadpis.textContent = "Z formuláře — přidat do ML:";
            blok.appendChild(nadpis);

            const radekKat = document.createElement("div");
            radekKat.style.cssText = "margin:2px 0;color:#999;";
            radekKat.appendChild(document.createTextNode("do kategorie "));
            const vyberKat = document.createElement("select");
            vyberKat.style.cssText = "font-size:10px;border:1px solid #553311;" + ROLETKA_STYL;
            KAT_PEVNE.forEach(k => {
                const o = document.createElement("option");
                o.value = k; o.textContent = k;
                o.style.cssText = ROLETKA_STYL;
                if (k === KAT_VYCHOZI) o.selected = true;
                vyberKat.appendChild(o);
            });
            radekKat.appendChild(vyberKat);
            blok.appendChild(radekKat);

            const vyber = [];
            navrhy.forEach(n => {
                const r = document.createElement("div");
                r.style.cssText = "margin:1px 0;color:#bbb;";
                r.title = n.zeme.join(", ");

                const zaskrt = document.createElement("input");
                zaskrt.type = "checkbox";
                zaskrt.checked = true;
                zaskrt.style.cssText = "vertical-align:middle;margin:0 3px 0 0;";
                r.appendChild(zaskrt);

                const t = document.createElement("span");
                t.textContent = window.DarkElfUtils.Spells.zkratka(n.kouzlo)
                    + (n.nasobek > 1 ? (" " + n.nasobek + "×") : "")
                    + " · " + n.zeme.length + (n.zeme.length === 1 ? " zem " : " zemí ");
                r.appendChild(t);

                const pole = document.createElement("input");
                pole.type = "text";
                pole.size = 5;
                pole.value = n.mo.replace(/^MO/, "");
                pole.title = "MO, která se zapíše do listu. Prázdné = bez MO (požadavek 0).";
                pole.style.cssText = "width:36px;font-size:10px;background:transparent;"
                    + "color:#ddd;border:1px solid #553311;";
                r.appendChild(pole);

                vyber.push({ navrh: n, zaskrt: zaskrt, pole: pole });
                blok.appendChild(r);
            });

            const pridat = document.createElement("button");
            pridat.className = "butt_sml";
            pridat.textContent = "Přidat do ML";
            pridat.style.cssText = "margin:4px 4px 0 0;padding:3px 10px;cursor:pointer;";
            pridat.onclick = (e) => {
                e.preventDefault();
                if (!stav.data) {
                    stav.data = { hlavicka: null, nejista: [], nezarazeno: [],
                                  sekce: [{ nazev: "", radky: [] }] };
                }
                const kat = vyberKat.value;
                const cil = stav.data.sekce[0] || (stav.data.sekce[0] = { nazev: "", radky: [] });
                vyber.forEach(v => {
                    if (!v.zaskrt.checked) return;
                    const zadano = v.pole.value.trim();
                    const m = zadano.match(/^(?:mo\s*)?(\d+)(\+)?$/i);
                    cil.radky.push({
                        kouzlo: window.DarkElfUtils.Spells.byName(v.navrh.kouzlo),
                        mo: m ? ("MO" + m[1] + (m[2] || "")) : "",
                        poznamka: "", kat: kat, nasobek: v.navrh.nasobek, prio: false,
                        zeme: v.navrh.zeme.slice()
                    });
                });
                stav.zFormulare = null;
                vykresli();
                ulozHotovy(zpetnyText.value);
            };
            blok.appendChild(pridat);

            const zrusit = document.createElement("a");
            zrusit.href = "#";
            zrusit.textContent = "zrušit";
            zrusit.style.cssText = "color:#996655;text-decoration:none;font-size:10px;";
            zrusit.onclick = (ev) => { ev.preventDefault(); stav.zFormulare = null; vykresli(); };
            blok.appendChild(zrusit);

            vystup.appendChild(blok);
        }

        function vykresliRucniMO() {
            const rucni = stav.rucni;
            const S = window.DarkElfUtils.Spells;
            const blok = document.createElement("div");
            blok.style.cssText = "margin:2px 0 4px 6px;padding:4px 6px;"
                + "border-left:2px solid #cc9944;background:rgba(204,153,68,0.07);";

            function prekresliPoUprave() {
                vykresli();
                ulozHotovy(zpetnyText.value);
            }

            (rucni.smazane || []).forEach((sm, i) => {
                const d = document.createElement("div");
                d.style.cssText = "color:#ff8866;margin:1px 0;";
                const t = document.createElement("span");
                t.textContent = "smazáno: " + sm.jmeno + " ";
                d.appendChild(t);
                const zpet = document.createElement("a");
                zpet.href = "#";
                zpet.textContent = "vrátit";
                zpet.style.cssText = "color:#cc9944;text-decoration:underline dotted;";
                zpet.onclick = (ev) => {
                    ev.preventDefault();
                    sm.sekce.radky.push({ kouzlo: sm.kouzlo, mo: sm.mo, poznamka: sm.poznamka,
                                          kat: sm.kat, nasobek: sm.nasobek, prio: sm.prio,
                                          zeme: [sm.jmeno], moZeme: {} });
                    sm.sekce.radky = slucRadky(sm.sekce.radky);
                    rucni.smazane.splice(i, 1);
                    if (rucni.zeme.indexOf(sm.jmeno) === -1) rucni.zeme.push(sm.jmeno);
                    prekresliPoUprave();
                };
                d.appendChild(zpet);
                blok.appendChild(d);
            });

            const radekKouzla = document.createElement("div");
            radekKouzla.style.cssText = "margin:2px 0;color:#bbb;";
            const popisekK = document.createElement("span");
            popisekK.textContent = "kouzlo ";
            radekKouzla.appendChild(popisekK);

            const volbaKouzla = document.createElement("select");
            volbaKouzla.style.cssText = "font-size:10px;background:#1a1008;color:#ddd;"
                + "border:1px solid #553311;max-width:140px;";
            kouzlaDoRoletky().forEach(skupina => {
                const grp = document.createElement("optgroup");
                grp.label = skupina.kat;
                skupina.kouzla.forEach(nazev => {
                    const o = document.createElement("option");
                    o.value = nazev;

                    o.textContent = nazev;
                    if (nazev === rucni.kouzlo.nazev) o.selected = true;
                    grp.appendChild(o);
                });
                volbaKouzla.appendChild(grp);
            });
            radekKouzla.appendChild(volbaKouzla);

            const popisekN = document.createElement("span");
            popisekN.textContent = " seslání ";
            radekKouzla.appendChild(popisekN);

            const obal = document.createElement("span");
            obal.style.cssText = "display:inline-block;vertical-align:middle;margin-left:2px;";
            const poleNasobek = document.createElement("input");
            poleNasobek.type = "number";
            poleNasobek.min = "1";
            poleNasobek.value = String(rucni.nasobek || 1);
            poleNasobek.title = "Kolikrát se má kouzlo seslat na každou z těch zemí.";
            poleNasobek.onfocus = () => poleNasobek.select();
            poleNasobek.style.cssText = "width:20px;font-size:10px;background:rgba(0,0,0,0.5);"
                + "color:#FFF;border:1px solid #555;text-align:center;padding:0;display:block;";
            obal.appendChild(poleNasobek);

            const sipky = document.createElement("div");
            sipky.style.cssText = "font-size:13px;font-weight:bold;line-height:10px;margin-top:2px;"
                + "display:flex;justify-content:space-between;user-select:none;";
            const cislo = () => (parseInt(poleNasobek.value, 10) || 1);
            const dolu = document.createElement("span");
            dolu.textContent = "−";
            dolu.style.cssText = "cursor:pointer;color:#ffaaaa;";
            dolu.onclick = () => { poleNasobek.value = String(Math.max(1, cislo() - 1)); };
            const nahoru = document.createElement("span");
            nahoru.textContent = "+";
            nahoru.style.cssText = "cursor:pointer;color:#aaffaa;";
            nahoru.onclick = () => { poleNasobek.value = String(cislo() + 1); };
            sipky.appendChild(dolu);
            sipky.appendChild(nahoru);
            obal.appendChild(sipky);
            radekKouzla.appendChild(obal);

            const krat = document.createElement("span");
            krat.textContent = "×";
            krat.style.cssText = "vertical-align:middle;margin-left:2px;";
            radekKouzla.appendChild(krat);
            blok.appendChild(radekKouzla);

            const vyber = [];
            rucni.zeme.forEach(jmeno => {
                const z = stav.idx ? stav.idx[normalizeText(jmeno)] : null;
                const r = document.createElement("div");
                r.style.cssText = "margin:1px 0;color:#bbb;";

                const zaskrt = document.createElement("input");
                zaskrt.type = "checkbox";
                zaskrt.style.cssText = "vertical-align:middle;margin:0 3px 0 0;";
                zaskrt.onchange = () => obnovPopisky();
                r.appendChild(zaskrt);

                if (z && z.id != null) r.appendChild(odkazNaMapu(z.id));
                const t = document.createElement("span");
                t.textContent = jmeno + " ";
                r.appendChild(t);

                const pole = document.createElement("input");
                pole.type = "text";
                pole.size = 3;
                pole.placeholder = (rucni.mo || "MO0").replace(/^MO/, "");
                pole.title = "Vlastní MO — jen číslo. Plus na konci (5+) znamená aspoň 5. Prázdné = nechat být.";
                pole.style.cssText = "width:26px;font-size:10px;margin-left:3px;"
                    + "background:transparent;color:#ddd;border:1px solid #553311;";

                pole.oninput = () => {
                    if (pole.value.trim()) { zaskrt.checked = true; obnovPopisky(); }
                };
                r.appendChild(pole);

                const krizek = document.createElement("a");
                krizek.href = "#";
                krizek.textContent = "✕";
                krizek.title = "Odebrat zem z listu (půjde vrátit, dokud je editor otevřený)";
                krizek.style.cssText = "color:#ff8866;margin-left:6px;text-decoration:none;";
                krizek.onclick = (ev) => {
                    ev.preventDefault();
                    const kde = najdiRadekZeme(stav.data, rucni.kouzlo.nazev, jmeno);
                    if (!kde) return;
                    rucni.smazane = rucni.smazane || [];
                    rucni.smazane.push({
                        jmeno: jmeno, kouzlo: kde.radek.kouzlo, mo: kde.radek.mo,
                        poznamka: kde.radek.poznamka, kat: kde.radek.kat,
                        nasobek: kde.radek.nasobek, prio: kde.radek.prio, sekce: kde.sekce });
                    presunZeme([{ zeme: jmeno, radek: kde.radek, sekce: kde.sekce, smazat: true }]);
                    rucni.zeme = rucni.zeme.filter(x => x !== jmeno);
                    prekresliPoUprave();
                };
                r.appendChild(krizek);

                vyber.push({ zeme: jmeno, zaskrt: zaskrt, pole: pole });
                blok.appendChild(r);
            });

            function ktereZeme() {
                const oznacene = vyber.filter(v => v.zaskrt.checked).map(v => v.zeme);
                return oznacene.length ? oznacene : vyber.map(v => v.zeme);
            }

            const tlacZmena = document.createElement("button");
            tlacZmena.className = "butt_sml";
            tlacZmena.style.cssText = "margin:4px 4px 2px 0;padding:3px 8px;cursor:pointer;";
            const tlacMO = document.createElement("button");
            tlacMO.className = "butt_sml";
            tlacMO.textContent = "Přepsat MO u zaškrtnutých";
            tlacMO.style.cssText = "margin:4px 0 2px 0;padding:3px 8px;cursor:pointer;";

            function obnovPopisky() {
                const kolik = vyber.filter(v => v.zaskrt.checked).length;
                tlacZmena.textContent = "Změnit " + (kolik ? ("u " + kolik + " zemí") : "u celého řádku");
            }
            obnovPopisky();

            tlacZmena.onclick = (ev) => {
                ev.preventDefault();
                const noveKouzlo = S.byName(volbaKouzla.value);
                const cislo = parseInt(poleNasobek.value, 10);
                const novyNasobek = (cislo > 0) ? cislo : 1;
                const zmeny = [];
                ktereZeme().forEach(jmeno => {
                    const kde = najdiRadekZeme(stav.data, rucni.kouzlo.nazev, jmeno);
                    if (!kde) return;
                    zmeny.push({ zeme: jmeno, radek: kde.radek, sekce: kde.sekce,
                                 kouzlo: noveKouzlo || kde.radek.kouzlo, nasobek: novyNasobek });
                });
                if (!zmeny.length) return;
                presunZeme(zmeny);
                stav.rucni = null;
                prekresliPoUprave();
            };
            blok.appendChild(tlacZmena);

            tlacMO.onclick = (ev) => {
                ev.preventDefault();
                const nalezy = [];
                vyber.forEach(v => {
                    if (!v.zaskrt.checked) return;
                    const rucneText = v.pole.value.trim();
                    if (!rucneText) return;
                    const m = rucneText.match(/^(?:mo\s*)?(\d+)(\+)?$/i);
                    if (!m) return;
                    const kde = najdiRadekZeme(stav.data, rucni.kouzlo.nazev, v.zeme);
                    if (!kde) return;
                    nalezy.push({ zeme: v.zeme, radek: kde.radek, sekce: kde.sekce,
                                  navrh: "MO" + m[1] + (m[2] || "") });
                });
                if (!nalezy.length) return;
                opravMO(nalezy);
                stav.rucni = null;
                prekresliPoUprave();
            };
            blok.appendChild(tlacMO);
            return blok;
        }

        function vykresliAliancni() {
            const blok = document.createElement("div");
            blok.style.cssText = "margin-top:6px;padding-top:4px;border-top:1px solid #553311;";

            const radek = (barva) => {
                const d = document.createElement("div");
                d.style.cssText = "margin:1px 0;line-height:1.35;color:" + barva + ";";
                return d;
            };

            const sila = stav.idxId
                ? kontrolaSily(stav.cast, stav.idxId, moZeListu(stav.data, stav.idx))
                : null;
            const vListu = idsZListu(stav.data, stav.idx);
            const dupl = duplicityVAlianci(stav.cast).filter(x => vListu[x.id]);
            const neprosle = (stav.idx && stav.data)
                ? neprosleVPlanu(stav.data, stav.cast, stav.idx) : [];

            const osy = (stav.idx && stav.data)
                ? slucOsy(kontrolaOs(stav.data, stav.cast, stav.idx).filter(n => n.druh !== "konflikt")) : [];
            const zak = (stav.idx && stav.data)
                ? kontrolaZakouzleno(stav.data, stav.cast, stav.idx)
                : { nalezy: [], potvrzeno: 0, celkem: 0 };
            const vZakouzleno = zak.nalezy;

            const hlavicka = document.createElement("div");
            hlavicka.style.cssText = "color:#777;";
            const doBubliny = [];
            doBubliny.push("Zdroj: Alianční kouzla (spells_list.asp). Číslo za kouzlem je síla seslání.");
            if (sila) {
                doBubliny.push("Projde: " + sila.projde);
                if (sila.odrazi.length) {
                    doBubliny.push("Odrazí se (" + sila.odrazi.length + "):" + "\n"
                        + sila.odrazi.map(x => "  " + x.zeme + " " + window.DarkElfUtils.Spells.zkratka(x.kouzlo)
                                               + " síla " + x.sila + " vs MO " + x.mo).join("\n"));
                }
                if (sila.nejiste.length) {
                    doBubliny.push("Nejisté (" + sila.nejiste.length + "):" + "\n"
                        + sila.nejiste.map(x => "  " + x.zeme + " — " + x.popis).join("\n"));
                }
                if (sila.neznameZeme.length) {
                    doBubliny.push("Na mapě neznám " + sila.neznameZeme.length
                        + " cílových zemí (cizí liga?).");
                }
            }
            const clenove = souhrnClenu(stav.cast);
            if (clenove.length) {
                const zbyvaCelkem = clenove.reduce((soucet, c) => soucet + c.zbyva, 0);
                doBubliny.push("Aliance (" + clenove.length + "), zbývá celkem "
                    + zbyvaCelkem + " kouzel:" + "\n"
                    + clenove.map(c => "  " + c.jmeno + " · SK " + c.silaMin + "–" + c.silaMax
                                       + " · zbývá " + c.zbyva).join("\n"));
            }

            hlavicka.title = doBubliny.join("\n" + "\n");
            hlavicka.textContent = "Aliance: " + ((stav.cast.kouzla || []).length) + " seslání";
            blok.appendChild(hlavicka);

            if (neprosle.length) {
                const nadpis = radek("#ff8866");
                nadpis.title = "Buď síla nesplnila MO napsanou v listu, nebo podle mapy "
                    + "se kouzlo odrazilo. Země zůstávají v plánu — sešli je znovu.";
                nadpis.textContent = "Neprošlo, zůstává v plánu (" + neprosle.length + "):";
                blok.appendChild(nadpis);

                neprosle.forEach(n => {

                    const protiCemu = (n.duvod === "mapa") ? n.mapa : n.pozadavek;
                    const d = radek("#ff8866");
                    d.title = (n.duvod === "pocet")
                        ? ("list žádá " + n.potreba + "× — prošlo " + n.pocet
                           + ". Slabá seslání se nepočítají, MO z listu je " + n.pozadavek + ".")
                        : (n.duvod === "mapa")
                        ? ("síla " + n.sila + " nestačí na MO " + n.mapa + " podle mapy"
                           + " (v listu je požadavek MO" + n.pozadavek + ") · seslal " + n.kouzlic)
                        : ("síla " + n.sila + " ≤ požadavek MO" + n.pozadavek
                           + " z listu · seslal " + n.kouzlic);
                    if (n.id != null) d.appendChild(odkazNaMapu(n.id));
                    const t = document.createElement("span");
                    t.textContent = n.zeme + " " + window.DarkElfUtils.Spells.zkratka(n.kouzlo)
                        + (n.duvod === "pocet"
                            ? (" — sesláno " + n.pocet + "× z " + n.potreba + "×")
                            : (" — síla " + n.sila + " na MO" + protiCemu
                               + (n.duvod === "mapa" ? " (mapa)" : "")));
                    d.appendChild(t);
                    blok.appendChild(d);
                });
            }

            if (osy.length) {
                const nadpis = radek("#cc9944");
                nadpis.title = "Spoko/nespo, počasí/krupky a klima/vír posouvají zem po třech "
                    + "škálách (porodnost, zlato, mana). Každá má tři stupně, takže se nasytí. "
                    + "Co na zem už letí od aliance, se odečítá od toho, co si vyžádal list.";
                nadpis.textContent = "Škály — sesílat jinak (" + osy.length + "):";
                blok.appendChild(nadpis);

                osy.forEach(n => {
                    const zkr = window.DarkElfUtils.Spells.zkratka(n.kouzlo);
                    const d = radek("#cc9944");

                    let co;
                    if (n.druh === "mene") {

                        co = "stačí " + Math.abs(n.zbyva) + "× místo " + Math.abs(n.pozadovano) + "×";
                    } else {
                        co = "netřeba";
                    }

                    const vsech = Object.keys(
                        window.DarkElfUtils.Spells.kroky(n.kouzlo) || {}).length;
                    const osyNalezu = n.osy || [n.osa];
                    const kterych = (osyNalezu.length < vsech)
                        ? (" (" + osyNalezu.join(", ") + ")") : "";

                    d.title = n.popis + " · osa " + osyNalezu.join(", ")
                        + " · list chce " + n.pozadovano
                        + (n.dodano != null ? (", už letí " + n.dodano) : "");
                    if (n.id != null) d.appendChild(odkazNaMapu(n.id));
                    const t = document.createElement("span");
                    t.textContent = n.zeme + " " + zkr + " — " + co + kterych;
                    d.appendChild(t);
                    blok.appendChild(d);
                });
            }

            if (vZakouzleno.length) {
                const nadpis = radek("#ff8866");
                nadpis.title = "Země ze sekce Zakouzleno, které buď v aliančním seznamu nejsou "
                    + "(nesesílalo se), nebo nesplnily MO napsanou v listu. MO z mapy se tu "
                    + "schválně neřeší — na zakouzlené zemi je věž cizí starost.";
                nadpis.textContent = "V Zakouzleno, ale nesedí (" + vZakouzleno.length + "):";
                blok.appendChild(nadpis);

                if (jeCiziList(zak)) {
                    const vysvetleni = radek("#cc9944");
                    vysvetleni.textContent = "…ani jedno seslání nesedí — je ten list z téhle ligy "
                        + "a z tohohle kola?";
                    blok.appendChild(vysvetleni);
                }

                vZakouzleno.forEach(n => {
                    const d = radek("#ff8866");
                    d.title = (n.duvod === "chybi")
                        ? ("V aliančním seznamu tahle zem s tímhle kouzlem není — nesesílalo se. "
                           + "Typicky když došla mana uprostřed dávky: hra sešle jen část zemí "
                           + "a neřekne, které vynechala.")
                        : (n.duvod === "pocet")
                        ? ("Řádek žádá " + n.potreba + "× a visí pod Zakouzleno, ale prošlo jen "
                           + n.pocet + ". Slabá seslání se nepočítají.")
                        : ("síla " + n.sila + " ≤ požadavek MO" + n.pozadavek
                           + " z listu · seslal " + n.kouzlic);
                    if (n.id != null) d.appendChild(odkazNaMapu(n.id));
                    const t = document.createElement("span");
                    t.textContent = n.zeme + " " + window.DarkElfUtils.Spells.zkratka(n.kouzlo)
                        + " — " + ((n.duvod === "chybi")
                            ? "v aliančním seznamu není"
                            : (n.duvod === "pocet")
                            ? ("sesláno " + n.pocet + "× z " + n.potreba + "×")
                            : ("síla " + n.sila + " na MO" + n.pozadavek + " → sesláno slabě"));
                    d.appendChild(t);
                    blok.appendChild(d);
                });

                const vratit = document.createElement("a");
                vratit.href = "#";
                vratit.style.cssText = "display:inline-block;color:#cc9944;text-decoration:none;"
                    + "margin:2px 0 2px 4px;";
                vratit.textContent = "↩ vrátit do plánu (" + vZakouzleno.length + ")";
                vratit.title = "Přesune tyhle země ze Zakouzleno zpátky mezi práci. "
                    + "Jméno kouzlícího se přitom ztratí — mimo Zakouzleno se v listu nedrží.";
                vratit.onclick = (ev) => {
                    ev.preventDefault();
                    presunKategorii(vZakouzleno);
                    vykresli();
                    ulozHotovy(zpetnyText.value);
                };
                blok.appendChild(vratit);
            }

            if (stav.presunuto && stav.presunuto.length) {
                const doZak = stav.presunuto.filter(x => x.kam === KAT_ZAKOUZLENO);
                const doJist = stav.presunuto.filter(x => x.kam === KAT_JISTOTA);
                const d = radek("#99aa88");
                d.title = stav.presunuto.map(x => x.zeme + " — " + x.popis
                                                  + " (seslal " + x.kouzlic + ")").join("\n");
                d.textContent = "Přesunuto: " + doZak.length + " do Zakouzleno"
                    + (doJist.length ? (" · " + doJist.length + " pro jistotu") : "");
                blok.appendChild(d);
            }

            if (dupl.length) {
                const d = radek("#cc9944");
                d.title = "Stejné kouzlo na tutéž zem od víc lidí. U nespo to může být záměr (skládá se).";
                d.textContent = "Poslali totéž (" + dupl.length + "): "
                    + dupl.map(x => x.zeme + " " + window.DarkElfUtils.Spells.zkratka(x.kouzlo)
                                    + " — " + x.kdo.join(", ")).join(" · ");
                blok.appendChild(d);
            }

            vystup.appendChild(blok);
        }

        function vykresliKontroluMO() {
            const k = kontrolaMO(stav.data, stav.idx);

            const blok = document.createElement("div");
            blok.style.cssText = "margin-top:6px;padding-top:4px;border-top:1px solid #553311;";

            const shrnuti = document.createElement("div");
            shrnuti.style.cssText = "color:#999;";
            shrnuti.textContent = "Kontrola MO: " + k.ok + " sedí"
                + (k.nesedi.length ? " · " + k.nesedi.length + " NESEDÍ" : "")
                + (k.neovereno.length ? " · " + k.neovereno.length + " nelze ověřit" : "")
                + (k.neznameZeme.length ? " · " + k.neznameZeme.length + " zemí neznám" : "");
            blok.appendChild(shrnuti);

            const vyber = [];

            k.nesedi.forEach(n => {
                const radek = document.createElement("div");
                radek.style.cssText = "margin:1px 0;color:#ff8866;";
                radek.title = n.popis;

                const zaskrt = document.createElement("input");
                zaskrt.type = "checkbox";
                zaskrt.checked = true;
                zaskrt.style.cssText = "vertical-align:middle;margin:0 3px 0 0;";

                const vlastni = document.createElement("input");
                vlastni.type = "text";
                vlastni.size = 3;
                vlastni.placeholder = String(n.mapa);
                vlastni.title = "Vlastní MO (jen číslo). Prázdné = použije se návrh " + n.navrh + ".";
                vlastni.style.cssText = "width:26px;font-size:10px;margin-left:3px;"
                    + "background:transparent;color:#ddd;border:1px solid #553311;";

                vyber.push({ nalez: n, zaskrt: zaskrt, vlastni: vlastni });

                radek.appendChild(zaskrt);
                if (n.id != null) radek.appendChild(odkazNaMapu(n.id));
                const t = document.createElement("span");
                t.textContent = n.zeme + " ";

                const zmena = document.createElement("span");
                zmena.style.cssText = "color:#cc9944;";
                const zListu = (n.vListu && /^MO/.test(n.vListu)) ? n.vListu.replace(/^MO/, "") : "0";
                zmena.textContent = " MO(" + zListu + "→" + n.navrh.replace(/^MO/, "") + ")";
                radek.appendChild(t);
                radek.appendChild(zmena);
                radek.appendChild(vlastni);
                blok.appendChild(radek);
            });

            if (k.nesedi.length) {
                const opravit = document.createElement("button");
                opravit.className = "butt_sml";
                opravit.textContent = "Přepsat MO u zaškrtnutých";
                opravit.style.cssText = "margin:4px 0;padding:3px 10px;cursor:pointer;";
                opravit.onclick = (e) => {
                    e.preventDefault();
                    const vybrane = [];
                    vyber.forEach(v => {
                        if (!v.zaskrt.checked) return;
                        const rucne = v.vlastni.value.trim();
                        if (rucne) {

                            const m = rucne.match(/^(\d+)(\+)?$/) || rucne.match(/^mo\s*(\d+)(\+)?$/i);
                            v.nalez.navrh = m ? ("MO" + m[1] + (m[2] || "")) : v.nalez.navrh;
                        }
                        vybrane.push(v.nalez);
                    });
                    opravMO(vybrane);
                    vykresli();
                    ulozHotovy(zpetnyText.value);
                };
                blok.appendChild(opravit);
            }

            if (k.neovereno.length) {
                const skupinyN = {};
                const poradiN = [];
                k.neovereno.forEach(n => {
                    if (!skupinyN[n.duvod]) { skupinyN[n.duvod] = []; poradiN.push(n.duvod); }
                    skupinyN[n.duvod].push(n);
                });
                poradiN.forEach(duvod => {
                    const g = skupinyN[duvod];
                    const hl = document.createElement("div");
                    hl.style.cssText = "color:#99aa88;margin:3px 0 0 0;";
                    hl.innerHTML = "<b>" + g.length + "</b> " + (g.length === 1 ? "zem" : "zemí")
                        + " nelze ověřit — " + skAttrSafe(duvod);
                    blok.appendChild(hl);

                    const sez = document.createElement("div");
                    sez.style.cssText = "margin-left:16px;color:#bbb;";
                    g.forEach(x => {
                        const r = document.createElement("div");
                        r.style.cssText = "margin:1px 0;";
                        if (x.id != null) r.appendChild(odkazNaMapu(x.id));
                        r.appendChild(document.createTextNode(x.zeme));
                        sez.appendChild(r);
                    });
                    blok.appendChild(sez);
                });
            }

            if (k.neznameZeme.length) {
                const d = document.createElement("div");
                d.style.cssText = "color:#996655;margin:1px 0;";
                d.textContent = "Na mapě jsem nenašel: " + k.neznameZeme.join(", ");
                blok.appendChild(d);
            }
            vystup.appendChild(blok);
        }

        async function nactiPodklady() {
            const konecMereni = window.DarkElfUtils.Mereni.usek('ML: nactiPodklady (mapa + alianční kouzla)');
            stav.sleva = { nejlepsi: 0, moje: 0, dostupne: false };
            stav.idx = null;
            stav.idxId = null;
            stav.hraci = null;
            stav.cast = null;
            stav.mojeSK = null;
            let hlavicka = null;
            try {
                await window.DarkElfUtils.MapAPI.fetch();
                const hl = window.DarkElfUtils.MapAPI.getHeader();
                hlavicka = hl;
                stav.sleva = window.DarkElfUtils.Spells.slevaRozsah(hl ? hl.id_rasa : null);
                const cache = window.DarkElfUtils.Cache.get("api", "map_json");
                if (cache && cache.zeme) {
                    stav.idx = indexZemi(cache.zeme);
                    stav.idxId = indexZemiPodleId(cache.zeme);

                    const jm = [];
                    cache.zeme.forEach(z => { if (z.hrac && jm.indexOf(z.hrac) === -1) jm.push(z.hrac); });
                    stav.hraci = jm;
                }
            } catch (er) {  }

            try { stav.cast = await window.DarkElfUtils.SpellsCastAPI.fetch(true); } catch (er) { stav.cast = null; }

            stav.mojeSK = mojeSKZeSeznamu(stav.cast, hlavicka);
            konecMereni();
        }

        function dnesniDatum() {
            const d = new Date();
            return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
        }

        function ulozHotovy(text) {
            try {
                localStorage.setItem(odecLigaKlic("ml_hotovy"),
                    JSON.stringify({ datum: dnesniDatum(), list: text }));
            } catch (e) { }
        }

        function nactiHotovy() {
            try {
                const u = JSON.parse(localStorage.getItem(odecLigaKlic("ml_hotovy")));
                if (!u || !u.list || u.datum !== dnesniDatum()) return null;
                return u.list;
            } catch (e) { return null; }
        }

        function presunHotove() {
            stav.presunuto = [];
            if (!stav.idx || !stav.data || !stav.cast) return;
            const navrhy = navrhyZakouzleno(stav.data, stav.cast, stav.idx);
            if (!navrhy.length) return;
            presunKategorii(navrhy);
            stav.presunuto = navrhy;
        }

        let obnovaBezela = false;
        async function obnovUlozene() {
            if (obnovaBezela) return;
            const list = nactiHotovy();
            if (!list) return;
            obnovaBezela = true;
            await nactiPodklady();
            const konecMereni = window.DarkElfUtils.Mereni.usek('ML: obnova po refreshi (parse + panel)');
            stav.data = parseML(list, { hraci: stav.hraci, zemeIdx: stav.idx, rozhodnuti: stav.rozhodnuti });
            presunHotove();
            vykresli();
            konecMereni();
            ulozHotovy(zpetnyText.value);
        }

        obnovit.onclick = async (e) => {
            e.preventDefault();
            if (!stav.data) return;
            const puvodni = obnovit.textContent;
            obnovit.textContent = "…";
            await nactiPodklady();
            presunHotove();
            vykresli();
            ulozHotovy(zpetnyText.value);
            obnovit.textContent = puvodni;
        };

        smazat.onclick = (e) => {
            e.preventDefault();
            if (!window.confirm("Smazat načtený ML a začít nanovo?")) return;
            try {
                localStorage.removeItem(odecLigaKlic("ml"));
                localStorage.removeItem(odecLigaKlic("ml_hotovy"));
            } catch (er) { }
            stav.data = null;
            stav.presunuto = [];
            stav.rucni = null;
            obnovaBezela = true;
            vstup.value = "";
            vystup.innerHTML = "";
            zpetnyText.value = "";
            zpetnyText.style.display = "none";
            kopirovat.style.display = "none";
            stavKouzleni.textContent = "";
            zavriOkno();
            vstup.focus();
        };

        tlacitko.onclick = async (e) => {
            e.preventDefault();

            if (!vstup.value.trim()) {
                stavKouzleni.textContent = "Vlep nejdřív magic list — prázdné pole nechroustám.";
                stavKouzleni.style.display = "block";
                vstup.focus();
                return;
            }

            try { localStorage.setItem(odecLigaKlic("ml"), vstup.value); } catch (er) {}

            await nactiPodklady();

            stav.data = parseML(vstup.value, { hraci: stav.hraci, zemeIdx: stav.idx, rozhodnuti: stav.rozhodnuti });
            presunHotove();
            vykresli();

            obnovaBezela = true;
            ulozHotovy(zpetnyText.value);

            otevriOknoTed();
        };

        function formularPodpis() {
            const ta = document.getElementById("textAreaMagic");
            let s = (ta ? ta.value : "") + "|";
            for (let i = 1; i <= 5; i++) {
                const sel = document.getElementById("K" + i);
                s += (sel ? sel.value : "") + ",";
            }
            return s;
        }
        let podpisFormulare = null;

        function sledujFormular() {
            if (formularPodpis() !== podpisFormulare) prekresliFormular();
        }

        function prekresliFormular(hint) {
            podpisFormulare = formularPodpis();
            const f = spocitejFormular(document);

            if (!f.polozky.length || !f.zeme.length) {
                stavKouzleni.style.display = "none";
                stavKouzleni.textContent = "";
                return;
            }

            const popis = f.polozky.map(p =>
                skAttrSafe(window.DarkElfUtils.Spells.zkratka(p.nazev))
                + (p.nasobek > 1 ? " " + p.nasobek + "×" : "")).join(" + ");

            let html = "Naloženo: <b>" + popis + "</b>"
                + " · " + f.zeme.length + (f.zeme.length === 1 ? " zem" : " zemí")
                + (f.cena != null ? " · <b>" + cz(f.cena) + " many</b>" : "")
                + (f.zbude != null ? " · zbude " + cz(f.zbude) : "");
            if (hint) html += "<br><span style='color:#999'>" + hint + "</span>";
            if (f.zbude != null && f.zbude < 0) {
                html += "<br><span style='color:#ff8866'>⚠ Na tohle nemáš manu.</span>";
            }

            stavKouzleni.innerHTML = html;
            stavKouzleni.style.display = "block";
        }

        function rucniMOZPole() {
            const pole = document.getElementById("ml_mo");
            const m = String((pole && pole.value) || "").trim().match(/^(?:mo\s*)?(\d+)(\+)?$/i);
            return m ? ("MO" + m[1] + (m[2] || "")) : null;
        }

        async function nabidniZFormulare() {
            const ta = document.getElementById("textAreaMagic");
            const kouzla = kouzlaZFormulare(document);
            const zeme = parseLands(ta ? ta.value : "");
            stav.zFormulare = null;
            if (!kouzla.length || !zeme.length) {
                stavKouzleni.textContent = kouzla.length
                    ? "V herní buňce nejsou žádné země."
                    : "V roletkách K1…K5 nemám žádné kouzlo.";
                telo.style.display = "block";
                hlavicka.textContent = "▾ Přehled magic listu";
                return;
            }

            const rucniMO = rucniMOZPole();
            if (rucniMO) {
                if (!stav.data) {
                    stav.data = { hlavicka: null, nejista: [], nezarazeno: [],
                                  sekce: [{ nazev: "", radky: [] }] };
                }
                const cil = stav.data.sekce[0] || (stav.data.sekce[0] = { nazev: "", radky: [] });
                kouzla.forEach(k => {
                    cil.radky.push({
                        kouzlo: window.DarkElfUtils.Spells.byName(k.nazev),
                        mo: rucniMO, poznamka: "", kat: KAT_VYCHOZI,
                        nasobek: k.nasobek, prio: false, zeme: zeme.slice()
                    });
                });
                telo.style.display = "block";
                hlavicka.textContent = "▾ Přehled magic listu";
                vykresli();
                ulozHotovy(zpetnyText.value);
                return;
            }

            if (!stav.idx) {
                stavKouzleni.textContent = "Načítám mapu…";
                await nactiPodklady();
            }
            stavKouzleni.textContent = stav.idx
                ? ""
                : "Mapa se nenačetla — MO doplň ručně.";
            stav.zFormulare = navrhZFormulare(kouzla, zeme, stav.idx);
            telo.style.display = "block";
            hlavicka.textContent = "▾ Přehled magic listu";
            vykresli();
        }

        (function pridejTlacitkoML() {
            const herni = document.getElementById("b_send_selected");
            if (!herni || !herni.parentNode || document.getElementById("ml_z_formulare")) return;
            const b = document.createElement("input");
            b.type = "button";
            b.id = "ml_z_formulare";
            b.className = herni.className || "butt_sml";
            b.value = "ML";
            b.title = "Načíst naklikaná kouzla a země jako požadavek do magic listu."
                + " Nic nesesílá.";
            b.style.cssText = "margin-bottom:6px;margin-left:4px;padding:4px 10px;cursor:pointer;";
            b.onclick = (e) => { e.preventDefault(); nabidniZFormulare(); };
            herni.parentNode.insertBefore(b, herni.nextSibling);

            const mo = document.createElement("input");
            mo.type = "text";
            mo.id = "ml_mo";
            mo.size = 3;
            mo.placeholder = "MO";
            mo.title = "MO pro všechny napsané země. Číslo → vloží se do ML rovnou,"
                + " bez schvalování. Prázdné → MO se dopočítá z mapy a nabídne ke kontrole.";
            mo.style.cssText = "width:34px;margin-left:4px;font-size:11px;text-align:center;"
                + "background:transparent;color:#ddd;border:1px solid #553311;";
            b.parentNode.insertBefore(mo, b.nextSibling);

            herni.parentNode.insertBefore(stavKouzleni, mo.nextSibling);

            for (let i = 1; i <= 5; i++) {
                const sel = document.getElementById("K" + i);
                if (sel) sel.addEventListener("change", sledujFormular);
            }
            const ta = document.getElementById("textAreaMagic");
            if (ta) {
                ["input", "keyup", "change"].forEach(ev =>
                    ta.addEventListener(ev, sledujFormular));
            }

            setInterval(sledujFormular, 400);
            prekresliFormular();
        })();

        if (nactiHotovy()) {
            telo.style.display = "block";
            hlavicka.textContent = "▾ Přehled magic listu";
            obnovUlozene();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
