# Changelog

## 1.0.0 — non ancora rilasciata

La prima versione pubblica di PackForge: un'officina per creare resource pack di Minecraft Java,
dalla prima texture al pack pubblicato, con l'anteprima degli shader LabPBR.

### Pack
- Apri un pack (cartella, o zip in sola lettura) o creane uno nuovo: nome, descrizione con i colori
  e gli stili del gioco, versione di Minecraft (il `pack_format` giusto è scelto da solo), icona.
- Esplora le texture del pack e quelle vanilla della tua versione (dal jar del gioco, solo come
  riferimento: non finiscono mai nel pack).
- Strumenti del pack: copertura (cosa manca), controllo delle mappe, ridimensiona a pixel netti,
  varianti di colore, backup con ripristino.

### Disegna
- Editor pixel con matita, gomma, secchiello, ombra, rumore, contagocce, linee, rettangoli, ellissi,
  selezione, bacchetta e sposta; pixel-perfect, simmetria, bordi continui per le texture ripetute.
- Colori con rampe di tonalità, palette salvate e i colori della texture; livelli; animazioni a
  frame con onion skin; consigli per chi inizia.
- Modalità Principiante (meno strumenti, tutorial in sei passi) e Pro, sullo stesso editor.

### Effetti (LabPBR)
- Dipingi le mappe `_n` (rilievo, occlusione, altezza) e `_s` (levigatezza, metalli, porosità,
  emissione) canale per canale, o generale dai colori.
- Materiali pronti (pietra, legno, metallo, vetro, minerale, foglie, emissivo…).
- Anteprima 3D come con uno shader: luce del giorno, tramonto, grotta, Nether; POM, pioggia, riflessi,
  ombre a pixel, bloom.

### Prova
- Guarda la texture in scena: muro, pavimento, distesa, campo coltivato, casa, grotta (un minerale
  sta nella sua roccia), sentiero; distanza e mipmap come nel gioco, vento sulle piante, confronto
  con vanilla, volo libero, oggetti in mano e nell'inventario.

### In blocco e texture connesse
- Applica in blocco: materiale e rilievo su tante texture insieme, con Prima/Dopo in 3D e l'elenco
  dei file che verranno scritti, prima di scrivere.
- Texture connesse (Continuity / OptiFine): metodo completo a 47 tessere, orizzontale o verticale a
  4, con il muro Prima/Dopo.

### Pubblica
- Esporta lo zip con versione, licenza, crediti e changelog; variante senza PBR o a un'altra
  risoluzione; scheda per Modrinth / CurseForge.
- Copia nel gioco con aggiornamento automatico e i tasti per ricaricare (F3 + T).

### Interfaccia
- Nuova interfaccia: barra dei menu, ricerca dei comandi (Ctrl+K), spazi di lavoro Pack · Disegna ·
  Prova · Effetti · Pubblica, icone e font pixel (Pixel Operator, Tiny5).

PackForge non è un prodotto ufficiale di Minecraft. Non approvato né associato a Mojang o Microsoft.
