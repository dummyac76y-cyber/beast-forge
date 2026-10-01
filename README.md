# Beast Forge

A complete modern Android rewrite of the classic **Fort Conquer / Beast Forge** lane-defense strategy game, built entirely with **Kotlin**, **Jetpack Compose**, and **Material 3**.

## Features

- **5-Lane Tactical Warfare**:
  - Deploy your evolved army of ferocious beasts across 5 dynamic battlefield lanes.
  - Opposing units clash in real-time lane combat with melee strikes, ranged attacks, and elemental counters.
  - March on the enemy citadel while protecting your own fortress walls and arcane defenses.

- **Elemental Mutation & Beast Forge**:
  - **Beast Classes**: Bipeds (Grizzly Bear, Werewolf, Apex Gorilla, Venom Lizard), Quadrupeds (Storm Tiger, Flame Lion, Iron Rhino, Glacier Hippo), and Dragons (Fire Dragon, Frost Wyrm, Gale Drake, Corrosion Drake).
  - **Elemental Wheel**: Fire, Ice, Lightning, Wind, Earth, and Poison with rock-paper-scissors counter advantages and critical strikes.
  - **5 Evolution Tiers**: Evolve beasts from Feral to Armored, Elemental, Apex, and Mythic Titan forms.
  - **Training & Upgrades**: Level up your beasts to scale HP, Attack, and combat potency.

- **Fortress Armory & Citadel Defenses**:
  - **Citadel Wall & Parapets**: Reinforce base health to withstand enemy sieges.
  - **Arcane Ballista Turret**: Automating defensive energy bolts at invading vanguard units.
  - **Mana Well Extractor**: Accelerate mana regeneration and expand maximum mineral reserves.
  - **Beast Pack Summons**: Draw new mystery beast cards from Silver and Golden Wyrm packs.

- **Game Modes**:
  - **Campaign Dominion**: Multi-stage journey through lush forests, volcanic crags, and frozen peaks culminating in titanic boss battles.
  - **Titan Arena**: Endless wave survival mode testing your strategic mastery and beast synergy.

- **Deck Customization & Active Loadout**:
  - Customize your 4-card active battle deck to craft unique offensive and defensive strategies.
  - Real-time cooldowns and mana resource management.
  - Emergency Fort Catapult Superweapon to unleash devastating barrages when overwhelmed.

- **Audio & Haptics**:
  - Full authentic sound effects for spells, attacks, evolutions, summonings, and citadel impacts.

## Technical Architecture

- **Language**: Kotlin 2.1
- **UI Framework**: Jetpack Compose & Material 3
- **Rendering**: Custom Canvas DrawScope pipeline for real-time 60 FPS multi-unit battlefield simulation
- **Audio**: Low-latency Android `SoundPool` engine
- **Persistence**: SharedPreferences with reactive state flows
- **Target SDK**: Android 36 (Android 14+ / 15 compatible)
