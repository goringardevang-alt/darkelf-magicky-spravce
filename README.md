# Dark Elf — Magický správce

Userscript pro [darkelf.cz](https://www.darkelf.cz). Dělá z magic listu něco, co
se dá kouzlit: přečte ho, spočítá magickou obranu cílů, poradí, kdo má co seslat,
a po přepočtu ukáže, co se doopravdy povedlo.

Základ je [magický skript od Noxtripa](https://www.darkelf.cz); tahle verze ho
přepsala a hodně rozšířila.

## Instalace

1. Nainstaluj si [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge).
2. Klikni na **[darkelf-magicky-spravce.user.js](https://raw.githubusercontent.com/goringardevang-alt/darkelf-magicky-spravce/main/darkelf-magicky-spravce.user.js)** — Tampermonkey nabídne instalaci.
3. Otevři ve hře **Magie**.

**[Podrobný návod s obrázky](NAVOD.md)** — co která část dělá a jak psát magic list.

Nic dalšího není potřeba. Jádro (Core Utils) je uvnitř souboru; kdo ho má
nainstalované zvlášť, tomu poběží to jeho a přibalená kopie se nespustí.

**Aktualizace si Tampermonkey stahuje sám.** Ručně: v Tampermonkey u skriptu
„Check for updates".

## Co to umí

**Čtení magic listu**
- Rozumí tomu, jak lidi píšou — `2x nespo`, `SmD2x`, `nespo MO 10+`,
  `spoko OMV`, země napsané před kouzlem i za ním, poznámky, jména hráčů.
- Sjednotí zápis a list zase složí, aby se dal poslat do chatu.
- Co nedává smysl, ukáže v okně s nálezy. **Neopravuje to samo** — jen řekne, kde to je.

**Magická obrana**
- Dopočítá MO neutrálních zemí z mapy, takže ji nemusíš psát ručně.
- Zkontroluje MO napsanou v listu proti tomu, co vidí na mapě, a nesrovnalosti nahlásí.
- U hráčských zemí bere list jako nadřazený — tam je dopočet nespolehlivý.

**Kouzlení**
- Klik na řádek nasype země do herní buňky, předvyplní kouzla do roletek
  a zaškrtne ty země na mapě. Odeslání zůstává na tobě, skript sám nekouzlí.
- Řádky téhož kouzla se dají **sčítat** — naklikáš jich několik a pojedou jednou
  dávkou. Co si odklikneš na mapě, z dávky vypadne a v listu zůstane nezakouzlené.
- Opačně taky: co naklikáš ve hře, načte tlačítkem **ML** zpátky do listu —
  a rozdělí země podle jejich magické obrany.
- Spočítá cenu many pro celý list i pro jednotlivé dávky, s alianční slevou
  i bez ní, a po naložení ukáže, kolik ti many zbude.
- Podle tvé SK odhadne šanci, že seslání projde.

**Kouzlení na hráče**
- Když do listu vlepíš soupisku protivníků z alianční stránky, rozdělí skript
  jejich země podle magické obrany na dávky, ze kterých se dá rovnou kouzlit.
- Země, kam jde útok, i ty, na kterých už dnes něco prošlo, vynechá.
- Po zakouzlení dopíše k hráči, co kdo seslal.

**Během kouzlení**
- Porovná list s tím, co aliance seslala **dneska** — čte alianční seznam kouzel,
  takže je to živé, ne až po přepočtu.
- Hotové přesune do „Zakouzleno", nedodělané nechá v plánu i s důvodem.
- Hlídá násobky (`2×nespo` s jedním sesláním není hotovo) a započítá, co na zem
  už letí od ostatních. Rozdělanou práci napíše do listu jako `(1 ze 2)`.
- Co nejde opravit hned, jde **odložit do půlnoci** — zmizí to z cesty, ale
  neztratí se a dá se to vrátit.
- Přes půlnoc si **nepamatuje nic** — seznam se přepočtem vynuluje a druhý den
  se začíná nanovo.

## Něco nefunguje?

Založ [issue](https://github.com/goringardevang-alt/darkelf-magicky-spravce/issues)
a přilož **magic list před a po** — na tom se to pozná nejrychleji. Hodí se i to,
co jsi čekal a co to udělalo místo toho.

## Poznámky

- Soubor v tomhle repu je **sestavený build**, ne zdroj. Editovat ho nemá smysl —
  příští aktualizace ho přepíše.
- Skript **nikdy nekouzlí sám** a nesahá na herní tlačítko odeslání. Čte stránky
  hry a předvyplňuje formuláře; poslední klik je vždycky tvůj.
- Dělej si s tím, co chceš. Vylepšení rád uvidím.

## Autoři

- **Noxtrip** — původní magický skript, na kterém to stojí
- **Gorin** — zadání, herní znalosti, testování ve hře
- **Claude Opus 5** ([Claude Code](https://claude.com/claude-code)) — přepis a rozšíření
