/* =====================================================================
   Pixel-Hunde – fünf Modi (Allgemein, Research, Lernen, Coden, Börse = Bär)
   - oben mittig im leeren Chat: alle Gesichter und das Plus zusammen in einer runden Leiste (Gesichter scrollbar),
     gewählter Hund hinterlegt; Plus öffnet die Liste mit Namen; nach dem ersten Senden verschwindet die Leiste
   - klein oben rechts am Eingabefeld: der gewählte Hund schaut über den Rand (Pfoten auf dem Rand, atmet, blinzelt) und holt
     ab und zu seinen Gegenstand hervor (Pfanne über der Flamme, Lupe, Buch, Laptop von hinten); solange die KI arbeitet, bleibt er
     dabei (kocht, sucht, liest, tippt). Beim Wechsel taucht er ganz ab, erst danach kommt der neue hoch
   - als kleiner Kopf links neben jeder KI-Antwort (neben „Thinking“/„Working“, sonst neben dem Text)
   Die Raster sind aus den Vorlagen der Nutzerin/des Nutzers umgerechnet (Havaneser, Border Collie mit Doktorhut);
   Allgemein = Havaneser in Creme, Research = Golden Retriever (aus der Pixel-Vorlage umgerechnet, kleine Augen und Nase sauber gesetzt;
   vorerst ohne Monokel), Coden = Oktopus in Rot-Orange (aus der Pixel-Vorlage umgerechnet, Augen mit Cremering gesetzt).
   Alle im selben groben 32er-Pixelstil – auch in den großen Ansichten (kein feineres Raster). Je Größe (32/24/20 px) ein eigenes Raster, damit jedes Pixel
   genau ein Bildschirmpixel ist. Zeichen = Farbe aus pal, '.' = durchsichtig.
   ===================================================================== */
const PixelDogs = (() => {
  const DOGS = {
    general: {
      32: {
        pal: {a: '#000000', b: '#f0f0e4', c: '#8c8072', d: '#a89c90', e: '#1b1b26', f: '#d0c3b4', g: '#b6aa9b', h: '#b6aa9b', i: '#b6aa9b', j: '#b6aa9b', k: '#a89c90', l: '#000000', m: '#000000', n: '#000000'},
        rows: [
          '...............a.a..............',
          '...........aaaababaa............',
          '.........aaffffabaffaaa.........',
          '.......aaffffbbbfbbffffaa.......',
          '......afffbbbbbbbbbbbbfffa......',
          '....aaafbbbbbbbbbbbbbbbbfaaa....',
          '...afffbbbbbbbbbbbbbbbbbbfffa...',
          '..afffbbbbbbbbbbbbbbbbbbbbfffa..',
          '..afbbbbbhhhhbbbbbbbijjjbbbbfa..',
          '.afbbbbbhbbbbhbbbbhbbbbhbbbbbfa.',
          '.fbbbbgbbbbbbbfbbfbbbbbbbbbbbff.',
          'afbbbbdbbffddbffffbddffbbdbbbbfa',
          'abbbbdbbfdaaadffffdaaadfbbdbbbba',
          'abbfbcbfcaabadffffdabaacfbcbfbba',
          'abbfbcfcddaaadfbbfdaaaddcfcbfbba',
          'abbbbccddddddbbbbbbddddddccbbbba',
          'affbbkdkffddbbbffbbbddffkdkbbbba',
          'afbbbddffdbbbbaaaabbbbdffddfbffa',
          'afbbfdffdbbbbfaaaaabbbbbfaadffda',
          'adffkdffbbbbbbkaaahbbbbbdfadffda',
          'adfdddfdbfbbbbbdakbbbbfbbaddddda',
          'adddddfdffbbffdaaddffbbfdaddddaa',
          '.addkaadfffffaaaaaadfffffaaaaaa.',
          '..aaaaaadffddfbfbbfadffdda......',
          '.....adaaddadfbbbbfdadddaa......',
          '.....addaadadfdfffddddaada......',
          '.....afddfaaadddkdddaaadaa......',
          '....affbfffdaaddkdkkddffff......',
          '....affbbffffeddddddaffbffa.....',
          '...affbbbbbfffeaaaffaabbbfaa....',
          '...afbbbbbbbbfffffabbbbbbbfa....',
          '....fbbbbbbbbbbfffbbbbbbbba.....',
        ],
      },
      24: {
        pal: {a: '#000000', b: '#f0f0e4', c: '#8c8072', d: '#a89c90', e: '#1b1b26', f: '#d0c3b4', g: '#b6aa9b', h: '#b6aa9b', i: '#b6aa9b', j: '#b6aa9b', k: '#a89c90', l: '#000000', m: '#000000', n: '#000000'},
        rows: [
          '...........a............',
          '........aaabaaaa........',
          '.....aafffbbfbfffa......',
          '....affbbbbbbbbbbffa....',
          '...affbbbbbbbbbbbbbfaa..',
          '..ffbbbbbbbbbbbbbbbbfa..',
          '.afbbbiiiibbbbbijjbbbfa.',
          'afbbbgbbbbibbibbbbgbbbfa',
          'afbbdbbfddffffddfbbdbbfa',
          'abbbdbfaaaffffaaafbdbbba',
          'abbbcfdaaafbbfaaacfkbbba',
          'abfbccddadbbbbdaddccbfba',
          'abbfhkfdbbbffbbddfkdbbba',
          'afbfdfdbbbaaaabbbkfhdbfa',
          'afbkhfdbbbfaaabbbbfhdfda',
          'adddhfbfbbbdafbbbfdhddda',
          'adddadffbfdaaaffbfdadda.',
          '.aaaaadfddffffkdfdaaaa..',
          '....aaadadfbbffadda.....',
          '....adaaaddkfddaaaa.....',
          '...afbffdaaaaaaddffa....',
          '...afbbfffeddddffbfa....',
          '..affbbbbffaaafbbbbfa...',
          '...fbbbbbbbffbbbbbbfa...',
        ],
      },
      20: {
        pal: {a: '#000000', b: '#f0f0e4', c: '#8c8072', d: '#a89c90', e: '#1b1b26', f: '#d0c3b4', g: '#b6aa9b', h: '#b6aa9b', i: '#b6aa9b', j: '#b6aa9b', k: '#a89c90', l: '#000000', m: '#000000', n: '#000000'},
        rows: [
          '.........aa.........',
          '......affabffa......',
          '....afbbbbbbbffa....',
          '...afbbbbbbbbbbfa...',
          '.affbbbbbbbbbbbbff..',
          '.fbbbhhhhbbhbbibbba.',
          'afbbhbbbbbbbbbbhbbfa',
          'abbdbfaaffffaafbdbba',
          'abfcfcaadffdaacfcfba',
          'abbccdaabbbbaadccbba',
          'afbgjfdbbfabbdfjjbfa',
          'afbdfdbbbaaabbbfdffa',
          'affdfbbbbaabbbbdddda',
          'addddfbbfaadfbfdddda',
          '.aaaadfddffjaffaaaa.',
          '...addddfbbfddda....',
          '...adfaaddddaaaa....',
          '...fffffedddjfffa...',
          '..afbbbffaaffbbba...',
          '..abbbbbbffbbbbbf...',
        ],
      },
    },
    research: {
      32: {
        pal: {a: '#000000', b: '#95613b', c: '#b37940', d: '#c3864b', f: '#d19851', g: '#eb858d', j: '#dda559', k: '#e8b365', l: '#efc074', m: '#f8ce86', E: '#4a2f1c', h: '#ffffff', N: '#5b3d2e', O: '#8a6250'},
        rows: [
          '............aaaaaaaa............',
          '.........aaakkkkkkkkaaa.........',
          '.....aaaakkkllkkklllkkkaaaa.....',
          '.....alljkkllmmklmmmmkkjlla.....',
          '....aalffkkllmmlmmmmmlkfflla....',
          '....aljdjkkllkllmllmmmkjdjla....',
          '...amjfckklllmkkkkmlllkkdjkma...',
          '...ajkcdkmlfjlkkkkljdlmkfcjja...',
          '..alffcflfaaadkkkkjaaaflfcffla..',
          '.alkcfbdfaahackkkkcahaafdbfcjla.',
          '.akjfdbbcfaaafkllkfaaafcbbdfjka.',
          'aljjjfbdfjbbbkmmmmkbbbjfdbfjjjla',
          'akfjjfcfkfjlkmmmmmmkljfkfcfjjfja',
          '.afjjjcfkkjjkmlkklmkjjkkfcjjffa.',
          '.afdjjcdkkkflaaaaaalfkkkdcjjffa.',
          '..acjjccjkkjaNOOOONajkkjccjjca..',
          '..abjjabjjjjaNaNNaNajjljbajjba..',
          '...ajfabkjjlmaNNNNamljfkbafja...',
          '...ajcacccammkaaaakmmacccacja...',
          '...acaccccakljbbbbjlkaccccaca...',
          '....aaccccaaabaaaabaaaccccaa....',
          '.....adddccaaabbbbaaaccddda.....',
          '....acfjjdcaadgddgdaaadjffca....',
          '...aacfkffcaaggggggaacffffcaa...',
          '....acjkjjdbaggggggabdjfkjca....',
          '....acfjkjfcbaggggabcfjljfca....',
          '...accfflkffbbaaaabbffflffcca...',
          '...acccflkffcbbbbbbcjkflfbcca...',
          '...acdfdjjfffcbbbccfkljjdfdca...',
          '...adjkccfkdjdccdcfjkkfccjfda...',
          '...adjljdfkjjjcdffjkkjdcjkjda...',
          '...adjkljdjlkjddjjkjjddjkljdaa..',
        ],
      },
      24: {
        pal: {a: '#000000', b: '#a0663f', c: '#b77c40', d: '#c68e4d', f: '#ea858c', g: '#d69d53', j: '#e0a95c', k: '#eab669', l: '#f2c77f', E: '#4a2f1c', h: '#ffffff', N: '#5b3d2e', O: '#8a6250'},
        rows: [
          '.........aaaaaa.........',
          '....aaaaakkkkkkaaaaa....',
          '....aljkkllkklllkjla....',
          '...alggkklllllllkjgla...',
          '...ajdjkllkkklllkjdka...',
          '..ajgckljjkkkkjglkcgja..',
          '.aldddkaabdkkgbaakdddla.',
          '.ajdcccahajkkjaahccccja.',
          'ajjjccgkkgkllkgkkgccjjja',
          'agjjcdjdkkllllkkdjdcjjga',
          '.agjddkjjkaaaakjjkddjga.',
          '.acgdcjkgaNOONagkjcdgca.',
          '..ajdbkkjaNaaNajkkbdja..',
          '..ajabgallaaaallagbaja..',
          '..acabcajldbbdljaccaca..',
          '...abcccaaaaaaaacccba...',
          '...addccaabbbbaaccdda...',
          '..aaddgcaaffffaacgddaa..',
          '...adjjgbaffffabgjjda...',
          '..accgkjdbaffabdgkjcca..',
          '..accdlgjcbbbbcjgkdcca..',
          '..acgdgggdbbbbgkjgddca..',
          '..adkgcggjccddjkgcddda..',
          '..adjkgdkjgdjjkjcgkjda..',
        ],
      },
      20: {
        pal: {a: '#000000', b: '#a3663b', c: '#bc8347', d: '#d09750', f: '#e88088', g: '#dda65c', j: '#eab66a', k: '#f3c77e', E: '#4a2f1c', h: '#ffffff', N: '#5b3d2e', O: '#8a6250'},
        rows: [
          '.......aaaaaa.......',
          '...aaaajkjjkjaaaa...',
          '...ajgjkkkkkkjgja...',
          '..ajdjjjkkkkkkgdja..',
          '..agcjjgjjjjgjjcga..',
          '.agdcgaacjjdaagcdga.',
          'ajdcbcahdjjdahcbcdja',
          'agddcgjjkkkkjjgcddga',
          'agdddjjgkggkgjjdddda',
          '.acdcjgjaaaajgjcdca.',
          '..adbjgkaNOakgjbda..',
          '..acbcakgaagkacbca..',
          '..aaccagcaacgaccaa..',
          '...accbaabbaabcca...',
          '..acgdcaffffacddca..',
          '...aggdbaffabddga...',
          '..acdjgcbaabcdjdca..',
          '..accjddbbbbgjgcca..',
          '..agdcgdcccggjccda..',
          '..agjdgjgcgggddjga..',
        ],
      },
    },
    learn: {
      32: {
        pal: {a: '#000000', b: '#f5f5f5', c: '#cb952a', d: '#b2b2b2', e: '#5b5b5b', f: '#fcc054', g: '#272727', h: '#786024', i: '#6c6c6c', j: '#3c3c41', k: '#e4e4e4', l: '#e4b448', m: '#0c0c0c', n: '#2a2a30'},
        rows: [
          '..............aaaa..............',
          '...........aajjjjjjaa...........',
          '.......aaajjjjjjajjjjjja........',
          '....aajjjjjjjjjaaaajjjjjjjaa....',
          '....aamjjjjjjjjjjjjjjaahjeaa....',
          '.......aaajjjjjjjjjjjiaaa.......',
          '.........agaajjjjjjaaaaba.......',
          '.....aaaajjgngaaaagnnnnaaaa.....',
          '...aajjjnjjjjjnnnggggnnnajjaa...',
          '.aajnnnnnaajjjjjgggggaanaannjaa.',
          '.jjnanannjjjaajjggaajjjncaaanjj.',
          'ajnannnnjjjnnjjbbbjnnjjjcannanja',
          'ajaannnjjnjnnnjbbjjnnjnaccnnaana',
          'aaaannnjjjabanjbbjnnaajaccnnaaaa',
          '....nnjnnnaaanjbbjjaabaaccnn....',
          '...annnnnjaajjbbbbjjaajaflnaa...',
          '....njjnnnjjjbbbbbbjjjnnnnja....',
          '....ajnnjjnjjbbbbbbbjnnjnnja....',
          '....ajnnjjjjbbaeeabbjjjjnnja....',
          '...ajnnnnjjjbbaaaaabbjjnnnnja...',
          '...ajnnnnjjbbbaaaaabbjjnnnjja...',
          '..aaajnnnnjbbbdaaabbbjnnnnjaaa..',
          '....jjjnnnjbbbddddbbbannnnjj....',
          '....jjnnnnnakddaadddannnnnjj....',
          '....ajnnnnndaaejjeaadannnnja....',
          '....ajnnndddadbbbbdaaddnnnna....',
          '.....adnndbdddaaaaaddbbdnda.....',
          '....agdnnbbbddddddddbbbdndga....',
          '....agddndbbbddddddbbbbnddga....',
          '...agggddddbbbdbbdbbbddddggga...',
          '...aggggdbbdbbbbbbbbddbddggga...',
          '...agggggddddbbbbbbddbdggggga...',
        ],
      },
      24: {
        pal: {a: '#000000', b: '#f5f5f5', c: '#cc9c30', d: '#545454', e: '#a8a8a8', f: '#242324', g: '#3c3c3c', h: '#606060', i: '#181819', j: '#303030', k: '#484848', l: '#b4b4b4', m: '#3c3c48', n: '#0c0000'},
        rows: [
          '..........aaaa..........',
          '.......aammmmmmaa.......',
          '....ammmmmmaaammmmma....',
          '...aammmmmmmmmmmanmaa...',
          '......aaammmmmmhaaa.....',
          '....aaamfiaaaaiifaaa....',
          '..aggiimmmmijjjjiaaiga..',
          '.ggaaiigaammjjjagicaaga.',
          'agaiiigggigbbagiggciiiga',
          'aiaiigggiigbbgiigiciiaia',
          'a..iiggaaagbbgiaagcii..a',
          '..aiiiigaggbbbgagicaia..',
          '...agiiiggbbbbggigiga...',
          '...aiigggbbaabbgggiia...',
          '..agiiiggbaaaabgggiig...',
          '..aiiiigbbaaaabbgiigia..',
          '..aggiiibbbeaebbgiiiga..',
          '...ggiiiabeaaebaiiiig...',
          '...aiiiiaedgkhaaiiiia...',
          '...aaiilllebbaalbiiaa...',
          '...alilbbllllllbblila...',
          '...aflllbbllllbbbllfa...',
          '..affllblbbbbbbblllffa..',
          '..afffllllbbbbllblfffa..',
        ],
      },
      20: {
        pal: {a: '#000000', b: '#f5f5f5', c: '#cc9830', d: '#545454', e: '#a8a8a8', f: '#242424', g: '#3c3c3c', h: '#181818', i: '#303030', j: '#b4b4b4', k: '#484848', l: '#3c3c48', m: '#181824', n: '#241824'},
        rows: [
          '........aaaa........',
          '.....alllllllla.....',
          '..aallllllalaallla..',
          '.....aallllllaaa....',
          '....aalfaaaamnaa....',
          '..gghhlllliiimaagg..',
          'aghahhgaaliaaggaahga',
          'ahhhhgghgbbghggchhha',
          'a.ahggaahbbhaagcha.a',
          '..ahhhaagbbgaagcha..',
          '..aghhhgbbbbgghhga..',
          '..aghgggbaabbgghga..',
          '..ghhhgbaaaabghhhg..',
          '..aghhgbbaabbghhga..',
          '..aghhhbeeaebahhga..',
          '..ahhhjaadkaajhhga..',
          '...ahhbjaaaajbjha...',
          '...fjjbbjjjjbbjjfa..',
          '..afjjjbbbbbbjjjfa..',
          '..fffjjjbbbbjjjfff..',
        ],
      },
    },
    code: {
      32: {
        pal: {a: '#000000', b: '#761c12', c: '#942919', d: '#803227', f: '#a9331d', g: '#bc3a1e', j: '#c14428', k: '#a35540', l: '#cd5838', m: '#ae9176', r: '#efd8b4', s: '#c9a77e', K: '#120d0c', h: '#ffffff'},
        rows: [
          '.............aaaaaa.............',
          '...........aajgjjjgaa...........',
          '..........ajjggjggglga..........',
          '.........agllllgglgljga.........',
          '........afjjjggggggljlga........',
          '........agjllgglgggggjja........',
          '...a....agjgggggggggggga....a...',
          '..alaa.acjgjgggggggggggca.aajaa.',
          '.agaclaacggggggggggggggcaajcafa.',
          '.aa.agaacjgggggggggggjgbaafa.aa.',
          '..a.afa.affffggggggfffcbaaja.aa.',
          '....aga.abbjljggggflgbba..afa...',
          '...afa..abdrrlgggflrrdba..afca..',
          '...aga...arKhrjggjrKhra....affa.',
          '..ajja...arKKsfggfrKKsa....affa.',
          '..acga...acsscfggfcssca...abajca',
          '...afja...abcfggggcbba....abajfa',
          '...aclfaaabfgggggggcbba.aabbagfa',
          '....acggcbfgglgggglggbaabbbajjfa',
          '....abbcbjggggggggggggabbbclgfa.',
          '..aaaaaajjgclggffggffgjjaffaaaa.',
          '.alljlglgfbcjggcbgjlcgjllfjljla.',
          'ajfccffccbajlgfbbfgjcbfgggfffgla',
          'agbaaaaakaajggbbbcgjfaabccaaacja',
          'afa.....afjggbbaabgjja.aaa...aga',
          'aga..aaajjgfbaa..afgja.......aga',
          '.acaaajjgccaa....acgjga.aaaaacfa',
          '..affcgfbaa.......afgla..acbcfa.',
          '...aajgca..........aggjaafcaaa..',
          '.....agca.a........acggjjfa.....',
          '.....aagfaa.........aaffcca.....',
          '.......aaa............adda......',
        ],
      },
      24: {
        pal: {a: '#000000', b: '#781f14', c: '#922a1a', d: '#a8341e', f: '#893e30', g: '#bd3b1f', j: '#a14835', k: '#c64b2d', l: '#b18c71', r: '#efd8b4', s: '#c9a77e', K: '#120d0c', h: '#ffffff'},
        rows: [
          '.........aaaaaa.........',
          '........agkkggka........',
          '.......akkkggkkka.......',
          '......agkkggggkgka......',
          '......agkkgkggggga......',
          '..aa.adggggggggggca.aaa.',
          '.acdaadgggggggggkcaacaa.',
          '.aaba.agggggggggga.aa.a.',
          '...aa.abdkggggkdba.aa...',
          '..ada.arrrkggkrrra..aa..',
          '..aa...rKhkgggrKh...ada.',
          '..aga..sssdggcsss...acda',
          '..ada..abcgggdbba..abada',
          '..acgaabgkgggggcaaabbada',
          '...abcbgggggggggcabbdgca',
          '.aaaadkgckgddgkdgkdddaa.',
          'akgdggdbckgbbgkcdkgkkgka',
          'adaajajaggdbbggdccccaaga',
          'aa..a.aggdbaacggfaja..aa',
          'ada.aagdcaa..agka.aa.ada',
          '.aaaggcaa....adga.adaca.',
          '...agca.......aggajdaa..',
          '....adca.......adgda....',
          '.....aa.........aca.....',
        ],
      },
      20: {
        pal: {a: '#000000', b: '#792117', c: '#952d1c', d: '#ab3720', f: '#bc3b1f', g: '#9c422f', j: '#c4492b', k: '#b27a5f', r: '#efd8b4', s: '#c9a77e', K: '#120d0c', h: '#ffffff'},
        rows: [
          '........aaaa........',
          '......aajjffaa......',
          '.....affjjfjjja.....',
          '.....ajjfjfffja.....',
          '.aa..affffffffa..aa.',
          '.aaaadffffffffcaabda',
          '.a.aacddffffddbadga.',
          '..aa.abjjffjgba.aa..',
          '..aa.arrdffdrra..aa.',
          '.ada..KhcffcKh...ada',
          '..aa..acdffcba..abfa',
          '..adaadfjffjdbaabcda',
          '...abdfdffffffccdfa.',
          'aaajjdbffccjddjffja.',
          'acagacaffbbffbaaaada',
          'aa.a.afdbaadfa....aa',
          'acaaadaaa..afa.aaaca',
          '.aadda.....adja.aaa.',
          '...adba.....affaa...',
          '....aa.......aca....',
        ],
      },
    },
    // Börse: Bär im Anzug (grüne Krawatte = Börse im Plus) – selbst gezeichnet im selben 32er-Pixelstil, Generator scratch/bear.py
    boerse: {
      32: {
        pal: {a: '#000000', b: '#6e4426', c: '#8c5a33', d: '#a8713f', e: '#47290f', m: '#d8b38a', M: '#bb9168', n: '#1b120c', w: '#ffffff', p: '#c98d6b', q: '#a9715a', g: '#3fb877', G: '#2b8a57', W: '#f2f2f2'},
        rows: [
          '................................',
          '.....aaaaa............aaaaa.....',
          '....abbbbba..........abbbbba....',
          '...abbbbbbba.aaaaaa.abbbbbbba...',
          '...abbpppbbaabbbbbbaabbpppbba...',
          '...abpppppbbbbbbbbbbbbpppppba...',
          '...abpqqqbbbbbbbbbbbbbbqqqpba...',
          '...abbpqbccddccbbbbbbbbbqpbba...',
          '....abbbbcdddcccbbbbbbbbbbba....',
          '.....abbbcccccccbbbbbbbbbba.....',
          '.....abbbbcccccbbbbbbbbbbba.....',
          '....abbbbbbbbbbbbbbbbbbbbbba....',
          '....abbbbbbwabbbbbbbwabbbbba....',
          '....abbbbbbaabbbbbbbaabbbbba....',
          '....abbbbbbbbbbbbbbbbbbbbbba....',
          '....abbbbbbbmmmnnmmmbbbbbbba....',
          '....abbbbbbmmmwnnnmmmbbbbbba....',
          '....abbbbbmmmmnnnnmmmmbbbbba....',
          '.....abbbbmmmmmmeemmmmbbbba.....',
          '......abbbmmmmmemmemmmbbba......',
          '......abbbmmmMMMMMMmmmbbba......',
          '.......abbbMMMMMMMMMMbbba.......',
          '........aabbMMMMMMMMbbaa........',
          '.......aaaaabbbbbbbbaaaaa.......',
          '......aeebbbbbbbbbbbbbbeea......',
          '.....abbbbbbbbbggbbbbbbbbba.....',
          '.....abbbbbbbbbggbbbbbbbbba.....',
          '....abbbbbbbbbbgGbbbbbbbbbba....',
          '...abbbbbbbbbbbgGbbbbbbbbbbba...',
          '...abbbbbbbbbbggGGbbbbbbbbbba...',
          '..abbbbbbbbbbbggGGbbbbbbbbbbba..',
          '..abbbbbbbbbbbggGGbbbbbbbbbbba..',
        ],
      },
      24: {
        pal: {a: '#000000', b: '#6e4426', c: '#8c5a33', d: '#a8713f', e: '#47290f', m: '#d8b38a', M: '#bb9168', n: '#1b120c', w: '#ffffff', p: '#c98d6b', q: '#a9715a', g: '#3fb877', G: '#2b8a57', W: '#f2f2f2'},
        rows: [
          '.....a............a.....',
          '...aabaa........aabaa...',
          '..abbbbbaaaaaaaabbbbba..',
          '..abpppbabbbbbbabpppba..',
          '..abpqpbbbbbbbbbbpqpba..',
          '..abpqbcdccbbbbbbbqpba..',
          '...abbbcddccbbbbbbbba...',
          '...abbbcccccbbbbbbbba...',
          '...abbbbbbbbbbbbbbbba...',
          '...abbbbwabbbbbwabbba...',
          '...abbbbaabbbbbaabbba...',
          '...abbbbbbmnnmbbbbbba...',
          '...abbbbmmnwnnmmbbbba...',
          '...abbbbmmmmmmmmbbbba...',
          '....abbbmmmmeemmbbba....',
          '.....abbmMMeMMembba.....',
          '......abbMMMMMMbba......',
          '.....aaaabbmmbbaaaa.....',
          '....aeebbbbbbbbbbeea....',
          '...abbbbbbbggbbbbbbba...',
          '...abbbbbbbgGbbbbbbba...',
          '..abbbbbbbbgGbbbbbbbba..',
          '..abbbbbbbbgGbbbbbbbba..',
          '.abbbbbbbbggGGbbbbbbbba.',
        ],
      },
      20: {
        pal: {a: '#000000', b: '#6e4426', c: '#8c5a33', d: '#a8713f', e: '#47290f', m: '#d8b38a', M: '#bb9168', n: '#1b120c', w: '#ffffff', p: '#c98d6b', q: '#a9715a', g: '#3fb877', G: '#2b8a57', W: '#f2f2f2'},
        rows: [
          '...aaa........aaa...',
          '..abbba......abbba..',
          '.abbpbbaaaaaabbpbba.',
          '.abpppbbbbbbbbpppba.',
          '.abbqbcccbbbbbbqbba.',
          '..abbccdccbbbbbbba..',
          '...abbcccbbbbbbba...',
          '..abbbbbbbbbbbbbba..',
          '..abbbbwabbbwabbba..',
          '..abbbbaammmaabbba..',
          '..abbbbmmnnmmbbbba..',
          '...abbmmmmmmmmbba...',
          '...abbmmmmmmmmbba...',
          '....abbMMMMMMbba....',
          '....aaabbmmbbaaa....',
          '...aeebbbbbbbbeea...',
          '...abbbbbggbbbbba...',
          '..abbbbbbgGbbbbbba..',
          '.abbbbbbbgGbbbbbbba.',
          '.abbbbbbbgGbbbbbbba.',
        ],
      },
    },
  };

  const MODES = [
    { id: 'general', name: 'Allgemein' },
    { id: 'learn', name: 'Lernen' },
    { id: 'research', name: 'Research' },
    { id: 'code', name: 'Coden' },
    { id: 'boerse', name: 'Börse' },
  ];
  // vorerst nicht verfügbar (ausgegraut, nicht wählbar, wird nicht vorgeschlagen) – der Coding-Agent ist noch nicht gut genug
  const UNAVAILABLE = new Set(['code']);

  /* ---------- Raster → SVG (gleiche Farbe in einer Zeile wird zu einem Rechteck) ---------- */
  function rects({ rows, pal }, ox = 0, oy = 0) {
    let out = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const ch = row[x];
        let n = 1;
        while (row[x + n] === ch) n++;
        if (ch !== '.' && pal[ch]) out += `<rect x="${ox + x}" y="${oy + y}" width="${n}" height="1" fill="${pal[ch]}"/>`;
        x += n;
      }
    });
    return out;
  }
  const svg = (id, size) => `<svg class="pd" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true">${rects(DOGS[id][size])}</svg>`;
  // Avatar im Chat: scharfes 24er-Raster (1 Rasterpunkt = 1 px, wie in der Leiste oben)
  const iconUrl = (id) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">${rects(DOGS[id][24])}</svg>`)}")`;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Begleiter am Eingabefeld: Hund (32 × 32) rechts, links Platz für Lupe bzw. Code-Blase ----------
     Spuren: jede hat Bilder (Liste von Teilen {x, y, rows, pal}) und eine Folge [Bild, ms]. Der Kopf atmet per CSS. */
  const SCENE_W = 46, SCENE_H = 32, DX = 14;
  const PROP = { K: '#0e0e0e', H: '#ffffff', M: '#b9b9b9', m: '#808080', G: '#8fa6b6', g: '#d3e0e8', B: '#8a5a32', b: '#5e3b1f',
    O: '#a24b3b', o: '#7a3328', y: '#d9a441', w: '#f2f2f2', v: '#c4c4c4', Z: '#151b24', X: '#4fcf8a',
    R: '#e0552b', P: '#ff9a2e', Y: '#ffd447', C: '#3a3f46', c: '#545b64',
    A: 'rgba(185, 210, 228, 0.42)', a: 'rgba(255, 255, 255, 0.75)', L: '#d9d9d9', N: '#4a4a4a', q: 'rgba(122, 180, 255, 0.35)' };
  const FUR = { general: ['#f0f0e4', '#d0c3b4'], research: ['#e2a868', '#c98a4c'], learn: ['#f5f5f5', '#b2b2b2'], code: ['#cc4520', '#b23718'], boerse: ['#8c5a33', '#6e4426'] }; // Coden: Tentakelspitzen in Rot-Orange
  const part = (rows, x, y, pal = PROP) => ({ rows, x, y, pal });
  const pawPal = (id) => ({ ...PROP, F: FUR[id][0], f: FUR[id][1] });
  const PAW = ['.KKKKK.', 'KFKFKFK', 'KFKFKFK', 'KfFFFfK'];       // liegt auf dem Rand: drei Zehen, unten etwas Schatten
  const PAW_HOLD = ['.KKK.', 'KFKFK', 'KFKFK', 'KfFfK', '.KKK.']; // hält etwas: Zehen um den Griff
  const restPaws = (id) => [part(PAW, DX + 5, 28, pawPal(id)), part(PAW, DX + 20, 28, pawPal(id))]; // Oktopus: eigene Spitzen (laptopTrack)
  // Pfote, die etwas hält – mit Unterarm, der von unten hinter dem Rand hochkommt
  const holdPaw = (id, x, y) => [part(Array(Math.max(0, 32 - y - 4)).fill('KFFFK'), x, y + 4, pawPal(id)), part(PAW_HOLD, x, y, pawPal(id))];

  // Augen zu: Lid in Fellfarbe über das Auge, die untere Kante bleibt als Strich
  const BLINK = {
    general: [part(['ddd', 'dddd'], DX + 9, 12, DOGS.general[32].pal), part(['ddd', 'dddd'], DX + 19, 12, DOGS.general[32].pal)],
    research: [part(['fff', 'aaa', 'fff'], DX + 10, 8, DOGS.research[32].pal), part(['ddd', 'aaa', 'ddd'], DX + 19, 8, DOGS.research[32].pal)],
    learn: [part(['nnn'], DX + 10, 13, DOGS.learn[32].pal), part(['nn'], DX + 20, 13, DOGS.learn[32].pal)],
    code: [part(['.jj.', 'jjjj', 'KKKK', '.ss.'], DX + 10, 12, DOGS.code[32].pal), part(['.ll.', 'llll', 'KKKK', '.ss.'], DX + 18, 12, DOGS.code[32].pal)],
    boerse: [part(['bb', 'aa'], DX + 11, 12, DOGS.boerse[32].pal), part(['bb', 'aa'], DX + 20, 12, DOGS.boerse[32].pal)],
  };
  const blinkTrack = (id) => ({ frames: [[], BLINK[id]], seq: [[0, 3600], [1, 130], [0, 2900], [1, 130], [0, 260], [1, 110]] });
  // Blick (liegt im atmenden Kopf, wird per Klasse gezeigt): Research schaut nach links zur Lupe, Allgemein nach links unten in die Pfanne
  const LOOK = {
    boerse: [part(['bb', 'wa', 'aa'], DX + 11, 12, DOGS.boerse[32].pal), part(['bb', 'wa', 'aa'], DX + 20, 12, DOGS.boerse[32].pal)], // Bär: Blick nach unten aufs Tablet
    research: [part(['aaaf', 'ahaf', 'aaaf'], DX + 9, 8, DOGS.research[32].pal), part(['aaad', 'ahad', 'aaad'], DX + 18, 8, DOGS.research[32].pal)],
    general: [part(['..fff', '...af', 'aab.f', '.aaa.'], DX + 8, 12, DOGS.general[32].pal), part(['.fff.', 'a.aff', 'ab...', 'aaa..'], DX + 18, 12, DOGS.general[32].pal)],
  };

  /* Gegenstand-Spur: idle = Folge im Ruhezustand (holt ab und zu etwas hervor),
     busy = solange die KI arbeitet: enter (hochholen) → loop (dabei bleiben) → exit (wegstecken) */
  const run = (frames, idle, enter, loop, exit, look = []) => ({ frames, seq: idle, busy: { enter, loop, exit }, look });

  // Research: holt eine Lupe hoch – die Pfote hält sie unten am Griff, das Glas (durchscheinend) neben dem Gesicht;
  // er sucht damit links, der Blick folgt; danach steckt er sie wieder weg
  const LENS = [
    '...KKKKK...',
    '.KKMMMMMKK.',
    '.KMaAAAAMK.',
    'KMaAAAAAAMK',
    'KMaAAAAAAMK',
    'KMAAAAAAAMK',
    'KMAAAAAAAMK',
    'KMAAAAAAAMK',
    '.KMAAAAAMK.',
    '.KKMMMMMKK.',
    '...KKBKK...',
    '....KBbK...',
    '....KBbK...',
    '....KBbK...',
  ];
  function lensTrack() {
    const at = (x, y) => [part(LENS, x, y), ...holdPaw('research', x + 3, y + 12), part(PAW, DX + 20, 28, pawPal('research'))];
    const frames = [restPaws('research'), at(15, 31), at(15, 26), at(15, 20), at(15, 14), at(13, 14), at(11, 15), at(14, 15), at(12, 13), at(10, 14)];
    const enter = [[1, 90], [2, 90], [3, 90], [4, 400]];
    const loop = [[5, 380], [8, 380], [9, 420], [6, 520], [8, 380], [5, 380], [4, 420], [7, 460], [4, 380]]; // sucht ständig hin und her
    const exit = [[3, 90], [2, 90], [1, 90], [0, 600]];
    return run(frames, [[0, 4800], ...enter, ...loop, ...exit, [0, 3800]], enter, loop, exit, [4, 5, 6, 7, 8, 9]);
  }

  // Allgemein: kocht – die Pfanne steht tief auf dem Rand, die Pfote greift den Stiel ganz natürlich (kurzer Unterarm),
  // aus der Pfanne schlagen Flammen nach oben und flackern; ab und zu schwenkt er sie kurz an, dann lodert es höher
  const PAN = [
    'KCCCCCCCCCCCCK.......',
    'KcLcccccccccccK......',
    '.KccccccccccccKKKKKKK',
    '..KCCCCCCCCCCKBBBBBBK',
    '...KKKKKKKKKK.KKKKKK.',
  ];
  const FLAME = [
    ['.....Y.....', '....YP...Y.', '..Y.YPY.YP.', '.YPYPRPYPPY', 'YPRPRRPRRPY', '.PRRRRRRRP.'],
    ['..Y........', '..PY...Y...', '.YPPY.YPY..', 'YPRPPYPRPY.', 'PRRPRRPRRPY', '.PRRRRRRRP.'],
    ['........Y..', '...Y...YP..', '..YPY.YPPY.', '.YPRPYPRPPY', 'YPRRPRRPRRP', '.PRRRRRRRP.'],
    ['...Y...Y...', '..YP..YPY..', '.YPPYYPRPY.', 'YPRPPRPRRPY', 'PRRRPRRPRRP', '.PRRRRRRRP.'],
  ];
  function panTrack() {
    // y: Oberkante der Pfanne; flame: welches Flammenbild (ohne = noch kein Feuer); dx: kurzes Schwenken
    const at = (y, flame, dx = 0) => [
      ...(flame != null ? [part(FLAME[flame], 2 + dx, y - FLAME[flame].length + 1)] : []),
      part(PAN, dx, y),
      ...holdPaw('general', 16 + dx, y + 1), part(PAW, DX + 20, 28, pawPal('general')),
    ];
    const Y = 26;
    const frames = [restPaws('general'), at(31), at(28), at(Y), at(Y, 0), at(Y, 1), at(Y, 2), at(Y, 3, -1), at(Y, 1, 1)];
    const enter = [[1, 90], [2, 90], [3, 260], [4, 140]];
    const fire = [[4, 140], [5, 140], [6, 140], [5, 120], [4, 140], [6, 140]];
    const swirl = [[7, 130], [8, 130], [7, 130], [5, 140]]; // schwenkt kurz – Flammen lodern höher
    const loop = [...fire, ...fire, ...swirl, ...fire]; // kocht durchgehend
    const exit = [[3, 160], [2, 90], [1, 90], [0, 600]];
    return run(frames, [[0, 4600], ...enter, ...fire, ...swirl, ...fire, ...fire, ...exit, [0, 3800]], enter, loop, exit, [3, 4, 5, 6, 7, 8]);
  }

  // Lernen: holt ein offenes Buch hoch – von hinten: zwei Hälften mit Rücken in der Mitte, oben Seitenkanten; blättert um
  const half = (left) => {
    const rows = [left ? '.KKKKKKKKK' : 'KKKKKKKKK.', 'KwvwvwvwvK', 'KKKKKKKKKK'];
    for (let i = 0; i < 10; i++) rows.push(left ? 'KOOOOOOOoK' : (i === 3 ? 'KoOyyyyOOK' : i === 5 ? 'KoOyyOOOOK' : 'KoOOOOOOOK'));
    rows.push('KKKKKKKKKK');
    return rows;
  };
  const BOOK = half(true).map((r, i) => r + (i < 2 ? 'K' : i === 13 ? 'K' : 'o') + half(false)[i]);
  const FLIP = [['..KK', '.KwK', 'KwwK'], ['.K.', 'KwK', 'KwK', 'KwK'], ['KK..', 'KwK.', 'KwwK']];
  function bookTrack() {
    const bx = DX + 5;
    const at = (y, flip) => [
      part(BOOK, bx, y),
      ...(flip != null ? [part(FLIP[flip], [bx + 12, bx + 9, bx + 5][flip], y - [3, 4, 3][flip])] : []),
      ...holdPaw('learn', bx - 3, y + 7), ...holdPaw('learn', bx + 19, y + 7),
    ];
    const frames = [restPaws('learn'), at(28), at(23), at(19), at(16), at(16, 0), at(16, 1), at(16, 2)];
    const enter = [[1, 80], [2, 80], [3, 80], [4, 700]];
    const turn = [[5, 120], [6, 120], [7, 120], [4, 1500]];
    const loop = [[4, 700], ...turn.slice(0, 3), [4, 900], ...turn.slice(0, 3), [4, 500]]; // liest und blättert durchgehend
    const exit = [[3, 80], [2, 80], [1, 80], [0, 600]];
    return run(frames, [[0, 5200], ...enter, ...turn, ...turn, ...exit, [0, 3600]], enter, loop, exit);
  }

  // Coden: holt einen aufgeklappten Laptop hoch – von hinten: Aluminium-Deckel (ohne Logo), Scharnier, darunter das Unterteil;
  // oben ein leichter Bildschirmschein, darüber sein Kopf. Die Pfoten tippen hinter dem Deckel (seitlich ein Stück zu sehen)
  const LAPTOP = (() => {
    const w = 26, row = (l, m, r = l) => l + m.repeat(w - 2) + r;
    const rows = [' '.repeat(w).replace(/ /g, '.').replace(/^\.{2}(.*)\.{2}$/, (x, mid) => '..' + 'q'.repeat(mid.length) + '..'), '.' + 'K'.repeat(w - 2) + '.', row('K', 'L')];
    for (let i = 0; i < 10; i++) rows.push('KL' + 'M'.repeat(w - 4) + 'mK');
    rows.push(row('K', 'm'), 'K'.repeat(w));
    rows.push('K' + 'N'.repeat(w) + 'K', '.' + 'K'.repeat(w) + '.'); // Unterteil, etwas breiter
    return rows.map((r) => (r.length < w + 2 ? '.' + r + '.' : r));
  })();
  // Oktopus: drei Tentakel greifen von hinten über die obere Deckelkante und hängen ein Stück darüber; beim Arbeiten wackeln ihre
  // Spitzen versetzt hin und her. Zwei eingerollte Tentakel halten sich links und rechts neben dem Laptop am Rand fest.
  // Ohne Laptop sitzt er mit seinen eigenen Tentakeln auf dem Rand; die oberen Arme schwingen sanft (armsTrack).
  // Tentakel über der Kante: oben fest (Spalte 1–4), die Spitze darunter eine Spalte nach links (−1), gerade (0) oder rechts (+1)
  const hook = (off) => ['..KK..', '.KFFK.', '.KFfK.', '.KFFK.', ...['KFFK', '.KK.'].map((r) => ('.'.repeat(1 + off) + r).padEnd(6, '.'))];
  const HOOK = { '-1': hook(-1), 0: hook(0), 1: hook(1) };
  const GRIP_L = ['.KK....', 'KFFK...', 'KFKFKKK', '.KFFfFK', '..KKKK.']; // kommt unter dem Laptop hervor, liegt auf dem Rand, Spitze rollt sich ein
  const GRIP_R = GRIP_L.map((r) => r.split('').reverse().join(''));
  function laptopTrack() {
    const lx = DX - 1;
    const hooks = [DX + 2, DX + 12, DX + 22]; // links neben, zwischen und rechts neben den Augen (Augen: Spalten 10–13 und 18–21)
    const WAVE = [-1, 0, 1, 0];
    const at = (y, k = null) => [
      part(GRIP_L, lx - 7, 27, pawPal('code')), part(GRIP_R, lx + 27, 27, pawPal('code')),
      part(LAPTOP, lx, y),
      ...(y <= 19 ? hooks.map((x, i) => part(HOOK[k == null ? 0 : WAVE[(k + i) % 4]], x, y - 1, pawPal('code'))) : []),
    ];
    // Augen des Oktopus liegen auf Zeile 12–15 → der Deckel beginnt darunter, die Tentakel hängen ab Zeile 16 über die Kante
    const frames = [[], at(31), at(27), at(23), at(19), at(17), at(17, 0), at(17, 1), at(17, 2), at(17, 3)];
    const enter = [[1, 80], [2, 80], [3, 80], [4, 80], [5, 380]];
    const type = [[6, 150], [7, 150], [8, 150], [9, 150]];
    const loop = [...type, ...type, ...type, [5, 220]]; // arbeitet durchgehend: Tentakelspitzen wackeln
    const exit = [[4, 80], [3, 80], [2, 80], [1, 80], [0, 600]];
    return run(frames, [[0, 5000], ...enter, ...type, ...type, ...type, ...type, ...exit, [0, 3400]], enter, loop, exit);
  }
  // Börse (Bär): holt ein Tablet hoch und schaut darauf – eine Kurslinie zeichnet sich Punkt für Punkt von links nach rechts,
  // läuft dann weiter (neue Kurse kommen rechts dazu), vorn ein heller Punkt = aktueller Kurs; grün, solange es seit links bergauf geht, sonst rot.
  // Dazu wackelt er ab und zu mit den Ohren (earsTrack). Solange die KI arbeitet, bleibt er am Tablet.
  const TAB_W = 20, TAB_H = 12;
  const LINE = [6, 5, 6, 4, 5, 3, 4, 4, 2, 3, 2, 3, 1, 2, 3, 2, 4, 3, 5, 4, 5, 6, 5, 7, 6, 4, 5, 3, 2, 3]; // Kurs je Spalte (0 = oben); läuft im Kreis
  function tabletRows(off, shown) {
    const iw = TAB_W - 2, ih = TAB_H - 3; // Rahmen + unten Leiste
    const g = Array.from({ length: ih }, () => Array(iw).fill('Z'));
    for (let y = 0; y < ih; y++) if (y % 3 === 2) for (let x = 0; x < iw; x += 2) g[y][x] = 'C'; // feines Raster
    const v = (j) => Math.min(ih - 1, LINE[(off + j) % LINE.length] + 1);
    const n = Math.min(iw - 1, shown);
    const col = v(n) <= v(0) ? 'X' : 'R'; // kleiner Wert = weiter oben = gestiegen
    for (let j = 0; j <= n; j++) {
      const a = v(j), b = j < n ? v(j + 1) : a;
      for (let y = Math.min(a, b); y <= Math.max(a, b); y++) g[y][j] = col;
    }
    g[v(n)][n] = 'H';
    return ['.' + 'K'.repeat(TAB_W - 2) + '.', ...g.map((r) => `K${r.join('')}K`), `K${'c'.repeat(TAB_W - 2)}K`, `K${'c'.repeat(8)}NN${'c'.repeat(8)}K`, '.' + 'K'.repeat(TAB_W - 2) + '.'];
  }
  function tabletTrack() {
    const bx = DX + 6, Y = 20;
    const at = (y, off = 0, shown = TAB_W - 3) => [part(tabletRows(off, shown), bx, y), ...holdPaw('boerse', bx - 3, y + 6), ...holdPaw('boerse', bx + TAB_W - 2, y + 6)];
    const draw = Array.from({ length: 9 }, (_, k) => at(Y, 0, 1 + k * 2)); // Linie zeichnet sich
    const scroll = Array.from({ length: 8 }, (_, k) => at(Y, k + 1)); // neue Kurse laufen rechts herein
    const frames = [restPaws('boerse'), at(29, 0, 0), at(26, 0, 0), at(23, 0, 0), ...draw, ...scroll];
    const D = 4, S = D + draw.length;
    const enter = [[1, 80], [2, 80], [3, 80], [D, 260]];
    const drawing = draw.map((_, k) => [D + k, 110]);
    const ticking = scroll.map((_, k) => [S + k, 300]);
    const loop = [...ticking, ...ticking, [D, 200], ...drawing]; // arbeitet: Linie läuft, wird neu gezeichnet
    const exit = [[3, 80], [2, 80], [1, 80], [0, 600]];
    const looking = frames.map((_, i) => i).filter((i) => i >= D);
    return run(frames, [[0, 4800], ...enter, ...drawing, [D + draw.length - 1, 600], ...ticking, ...ticking, ...exit, [0, 3800]], enter, loop, exit, looking);
  }
  // Ohren: die oberen Ohrspitzen kippen kurz nach außen bzw. innen (Zeilen 1–4)
  const EAR_ROWS = [1, 4], EAR_COLS = { L: [3, 11], R: [20, 28] };
  const earPart = (side, dx) => {
    const { rows, pal } = DOGS.boerse[32], [y0, y1] = EAR_ROWS, [x0, x1] = EAR_COLS[side];
    const out = [];
    for (let y = y0; y <= y1; y++) { const sh = y <= y0 + 1 ? dx : 0; let r = ''; for (let x = x0 - 1; x <= x1 + 1; x++) { const sx = x - sh; r += sx >= x0 && sx <= x1 ? rows[y][sx] : '.'; } out.push(r); }
    return part(out, DX + x0 - 1, y0, pal);
  };
  function earsTrack() {
    const base = [earPart('L', 0), earPart('R', 0)];
    const frames = [base, [earPart('L', -1), earPart('R', 0)], [earPart('L', 0), earPart('R', 1)], [earPart('L', -1), earPart('R', 1)]];
    const twitch = [[1, 120], [0, 90], [1, 120], [0, 0]];
    return { frames, seq: [[0, 3200], ...twitch, [0, 4200], [2, 140], [0, 100], [2, 140], [0, 5200], [3, 160], [0, 2400]], busy: { enter: [[0, 200]], loop: [[0, 2600], [3, 140], [0, 1800], [1, 120], [0, 120], [1, 120]], exit: [[0, 200]] }, inHead: true };
  }

  // die beiden oberen Arme (eingerollte Enden links und rechts neben dem Kopf) schwingen: Zeilen 6–11 eine Spalte nach außen bzw. innen
  const ARM_ROWS = [6, 11], ARM_COLS = { L: [0, 7], R: [24, 31] };
  const armPart = (side, dx) => {
    const { rows, pal } = DOGS.code[32], [y0, y1] = ARM_ROWS, [x0, x1] = ARM_COLS[side];
    const out = [];
    for (let y = y0; y <= y1; y++) { let r = ''; for (let x = x0 - 1; x <= x1 + 1; x++) { const sx = x - dx; r += sx >= x0 && sx <= x1 ? rows[y][sx] : '.'; } out.push(r); }
    return part(out, DX + x0 - 1, y0, pal);
  };
  function armsTrack() {
    const frames = [[armPart('L', 0), armPart('R', 0)], [armPart('L', -1), armPart('R', 1)], [armPart('L', 1), armPart('R', -1)]];
    const sway = [[0, 700], [1, 420], [0, 520], [2, 420]];
    const fast = [[1, 220], [0, 160], [2, 220], [0, 160]];
    return { frames, seq: [...sway, [0, 1600], ...sway, [0, 2600]], busy: { enter: fast, loop: fast, exit: [[0, 200]] }, inHead: true };
  }

  function sceneTracks(id) {
    return [blinkTrack(id), { general: panTrack, research: lensTrack, learn: bookTrack, boerse: tabletTrack }[id]?.() || laptopTrack(), ...(id === 'code' ? [armsTrack()] : []), ...(id === 'boerse' ? [earsTrack()] : [])];
  }
  const partsSvg = (parts) => parts.map((p) => rects(p, p.x, p.y)).join('');
  function scene(id) {
    const tracks = sceneTracks(id);
    const g = (t, i) => `<g data-track="${i}">${t.frames.map((f, k) => `<g data-f="${k}"${k ? ' style="display:none"' : ''}>${partsSvg(f)}</g>`).join('')}</g>`;
    // Kopf, Blinzeln und Blick atmen gemeinsam; Pfoten und Gegenstände bleiben stehen
    const look = LOOK[id] ? `<g class="pd-look">${partsSvg(LOOK[id])}</g>` : '';
    // Oktopus: die Arm-Enden zeichnet die Arm-Spur (sie schwingen) – im Grund-Raster bleiben sie leer
    const blank = (rows, [y0, y1], cols) => rows.map((r, y) => (y >= y0 && y <= y1 ? r.split('').map((ch, x) => ((x >= cols.L[0] && x <= cols.L[1]) || (x >= cols.R[0] && x <= cols.R[1]) ? '.' : ch)).join('') : r));
    const base = id === 'code' ? { ...DOGS.code[32], rows: blank(DOGS.code[32].rows, ARM_ROWS, ARM_COLS) }
      : id === 'boerse' ? { ...DOGS.boerse[32], rows: blank(DOGS.boerse[32].rows, EAR_ROWS, EAR_COLS) } : DOGS[id][32]; // Bär: Ohrspitzen zeichnet die Ohren-Spur
    const head = tracks.map((t, i) => (i === 0 || t.inHead ? g(t, i) : '')).join('');
    const body = `<g class="pd-breathe">${rects(base, DX, 0)}${look}${head}</g>${tracks.map((t, i) => (i === 0 || t.inHead ? '' : g(t, i))).join('')}`;
    return { html: `<svg class="pd pd-scene" width="${SCENE_W}" height="${SCENE_H}" viewBox="0 0 ${SCENE_W} ${SCENE_H}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`, tracks };
  }

  /* Abspielen: jede Spur läuft für sich; Gegenstand-Spuren wechseln zwischen Ruhe und „arbeitet“ */
  let runners = [];
  let busy = false;
  function play(root, tracks) {
    runners.forEach((r) => r.stop());
    runners = [];
    if (reduced()) return;
    tracks.forEach((t, i) => {
      const g = root.querySelector(`[data-track="${i}"]`);
      let timer = null;
      const show = (f) => {
        g.querySelectorAll(':scope > [data-f]').forEach((n) => { n.style.display = +n.dataset.f === f ? '' : 'none'; });
        if (t.look) root.classList.toggle('looking', t.look.includes(f));
      };
      const seqRun = (seq, loop, then) => {
        clearTimeout(timer);
        let k = 0;
        const tick = () => {
          if (k >= seq.length) { if (!loop) return then?.(); k = 0; }
          const [f, ms] = seq[k++];
          show(f);
          timer = setTimeout(tick, ms);
        };
        tick();
      };
      const r = {
        stop: () => clearTimeout(timer),
        idle: () => seqRun(t.seq, true),
        work: () => t.busy && seqRun(t.busy.enter, false, () => seqRun(t.busy.loop, true)),
        rest: () => t.busy && seqRun(t.busy.exit, false, () => seqRun(t.seq, true)),
      };
      runners.push(r);
      if (busy && t.busy) r.work();
      else timer = setTimeout(r.idle, i * 700); // leicht versetzt, damit nicht alles gleichzeitig passiert
    });
  }
  // KI arbeitet (Senden-Knopf zeigt Stopp) → Hund holt seinen Gegenstand und bleibt dabei, bis die Antwort fertig ist
  function setBusy(on) {
    if (on === busy) return;
    busy = on;
    runners.forEach((r) => (on ? r.work() : r.rest()));
  }

  /* ---------- Agenten-Feld (Haupt-Chat und Dokument-Chat) ----------
     Fährt über dem Eingabefeld heraus (gleiche Breite und Rundung). Karten wie in der Vorlage: Hund auf getönter Fläche mit
     Kachel-Bild rechts, Etikett, Beschreibung, Auswählen/Aktiv – nur die festen Agenten.
     Auswahl: Haken → Feld fährt zurück → erst dann wechselt der Hund. */
  const INFO = {
    general: { icon: 'sparkle', tint: 'rgba(240, 232, 212, 0.07)', text: 'Für alles – fragt nach, erklärt, recherchiert, schreibt und programmiert.' },
    research: { icon: 'search', tint: 'rgba(226, 168, 104, 0.08)', text: 'Recherchiert gründlich – nur auf vertrauenswürdigen Seiten.' },
    learn: { icon: 'book', tint: 'rgba(255, 255, 255, 0.05)', text: 'Erklärt Schulstoff verständlich, auch mit deinem Material.' },
    code: { icon: 'terminal', tint: 'rgba(226, 96, 58, 0.09)', text: 'Hilft beim Programmieren. Projekte mit Vorschau folgen.' },
    boerse: { icon: 'trend', tint: 'rgba(140, 90, 51, 0.10)', text: 'Nur Aktien: Echtzeitkurse, Charts, Nachrichten – wann rein, wann raus fürs Planspiel Börse.' },
  };
  const fine = (id) => (DOGS[id][64] ? 64 : 32); // feineres Raster für die großen Ansichten
  const art = (id, size = 64) => `<svg class="pd" width="${size}" height="${size}" viewBox="0 0 ${fine(id)} ${fine(id)}" shape-rendering="crispEdges" aria-hidden="true">${rects(DOGS[id][fine(id)])}</svg>`;
  // Kachel-Bild rechts: dieselben abgerundeten Quadrate wie beim Bild-Erzeugen – gerades Raster, ohne Animation, 9 % Deckkraft;
  // von rechts nach links blendet die Maske (style.css) sie aus. Breiter als jede Karte, rechts bündig → nie oben/unten angeschnitten.
  const tilesArt = (() => {
    const W = 420, H = 76, SIZE = 10, GAP = 5, ROWS = 5, oy = (H - ROWS * SIZE - (ROWS - 1) * GAP) / 2;
    let out = '';
    for (let r = 0; r < ROWS; r++) {
      for (let x = W - oy - SIZE; x > -SIZE; x -= SIZE + GAP) out += `<rect x="${x}" y="${oy + r * (SIZE + GAP)}" width="${SIZE}" height="${SIZE}" rx="3"/>`;
    }
    return `<svg class="ap-tiles" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"><g fill="#fff" fill-opacity="0.09">${out}</g></svg>`;
  })();
  const ico = (n) => (window.FadeIcons ? FadeIcons.svg(n, 12) : '');
  const heroDog = (id) => art(id);
  const pickers = new Set(); // alle offenen/geschlossenen Agenten-Felder (Klick daneben schließt sie)

  // host: das Eingabefeld (position: relative); triggers: was das Feld öffnet; onPick(id): Hund wechseln
  function makePicker(host, triggers, onPick) {
    const picker = document.createElement('div');
    picker.className = 'agent-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Agenten');
    picker.innerHTML = `<div class="ap-inner"><div class="ap-head"><span>Agenten</span><button type="button" class="ap-close" aria-label="Schließen" title="Schließen">${ico('x')}</button></div><div class="ap-grid">`
      + MODES.map((m) => {
        const off = UNAVAILABLE.has(m.id);
        return `<div class="ap-card${off ? ' ap-off' : ''}" data-agent="${m.id}"${off ? ' aria-disabled="true" title="Vorerst nicht verfügbar"' : ''}><div class="ap-art" style="background-color:${INFO[m.id].tint}">${tilesArt}${art(m.id)}<span class="ap-chip">${ico(INFO[m.id].icon)}${m.name}</span></div>`
          + `<p class="ap-text">${INFO[m.id].text}</p><div class="ap-actions">${off ? '<span class="ap-soon">Nicht verfügbar</span>' : `<button type="button" class="ap-pick" data-mode="${m.id}"></button>`}</div></div>`;
      }).join('')
      + `</div></div>`;
    host.prepend(picker);
    const paint = (current = mode) => picker.querySelectorAll('.ap-pick[data-mode]').forEach((b) => {
      const on = b.dataset.mode === current;
      b.classList.toggle('on', on);
      b.innerHTML = on ? `${ico('check')}Aktiv` : 'Auswählen';
    });
    const set = (open) => {
      if (open) { paint(); picker.querySelectorAll('.ap-card.chosen').forEach((c) => c.classList.remove('chosen')); }
      picker.classList.toggle('open', open);
      host.classList.toggle('picking', open);
    };
    triggers.forEach((t) => t.addEventListener('click', () => set(!picker.classList.contains('open'))));
    picker.addEventListener('click', (e) => {
      if (e.target.closest('.ap-close')) { set(false); return; }
      const card = e.target.closest('.ap-card[data-agent]');
      if (!card || UNAVAILABLE.has(card.dataset.agent)) return;
      const id = card.dataset.agent;
      paint(id);
      card.classList.add('chosen');
      setTimeout(() => set(false), 280);
      if (id !== mode) setTimeout(() => onPick(id), 280 + 420);
    });
    const api = { el: picker, set, triggers };
    pickers.add(api);
    return api;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', (e) => pickers.forEach((p) => {
      if (!p.el.isConnected) { pickers.delete(p); return; }
      if (!p.el.contains(e.target) && !p.triggers.some((t) => t.contains(e.target))) p.set(false);
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pickers.forEach((p) => p.set(false)); });
  }

  /* ---------- Dokument-Chat: Begleiter am Eingabefeld (ruhig, atmet), im leeren Chat der Hund mittig mit
     „What should we work on today?“, Klick öffnet das Agenten-Feld – passend zur Breite des Seitenfensters ---------- */
  const docHosts = new Set();
  function attachDoc(form) {
    if (form.dataset.dogs) return;
    form.dataset.dogs = '1';
    form.classList.add('dog-host');
    const peek = document.createElement('div');
    peek.className = 'dog-peek doc-peek';
    peek.setAttribute('role', 'button');
    peek.setAttribute('aria-label', 'Agenten anzeigen');
    peek.title = 'Agenten';
    const hero = document.createElement('div');
    hero.className = 'dog-hero doc-hero';
    hero.innerHTML = '<button type="button" class="dh-dog" aria-label="Agenten anzeigen" title="Agenten"></button><div class="dh-title">What should we work on today?</div>';
    form.append(peek, hero);
    const draw = (id) => {
      peek.innerHTML = scene(id).html; // erstes Bild jeder Spur: Pfoten auf dem Rand
      hero.querySelector('.dh-dog').innerHTML = heroDog(id);
    };
    draw(mode);
    makePicker(form, [peek, hero.querySelector('.dh-dog')], (id) => selectFn?.(id));
    docHosts.add({ form, draw });
  }
  const refreshDocs = (id) => docHosts.forEach((h) => { if (!h.form.isConnected) docHosts.delete(h); else h.draw(id); });

  /* ---------- Oberfläche ---------- */
  let selectFn = null; // von außen: Hund wechseln (z. B. Karte „Zu Coden wechseln“)
  const KEY = 'dogMode';
  let mode = 'general';
  try { if (DOGS[localStorage.getItem(KEY)]) mode = localStorage.getItem(KEY); } catch {}
  if (UNAVAILABLE.has(mode)) mode = 'general'; // gespeicherter, inzwischen gesperrter Agent → Allgemein

  function mount() {
    const panel = document.querySelector('.panel');
    const composer = document.getElementById('composer');
    const chat = document.getElementById('chat');
    if (!panel || !composer || !chat) return;

    // Köpfe als Bild für den Avatar neben den KI-Antworten
    MODES.forEach((m) => document.documentElement.style.setProperty(`--dog-${m.id}`, iconUrl(m.id)));

    // Leiste oben mittig (nur im leeren Chat): alle Gesichter in einer runden Leiste (ohne Plus)
    const bar = document.createElement('div');
    bar.className = 'dog-modes';
    bar.innerHTML = `<div class="dm-pill"><div class="dm-scroll" role="radiogroup" aria-label="Begleiter">${MODES.map((m) => `<button type="button" class="dm-dog${UNAVAILABLE.has(m.id) ? ' off' : ''}" role="radio" data-mode="${m.id}" aria-label="${m.name}" title="${m.name}${UNAVAILABLE.has(m.id) ? ' – vorerst nicht verfügbar' : ''}"${UNAVAILABLE.has(m.id) ? ' disabled' : ''}>${svg(m.id, 24)}</button>`).join('')}</div></div>`;
    panel.append(bar);
    const pill = bar.querySelector('.dm-scroll');
    // Mausrad scrollt die Leiste waagerecht
    pill.addEventListener('wheel', (e) => {
      if (pill.scrollWidth <= pill.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      pill.scrollLeft += e.deltaY;
    }, { passive: false });

    // Begleiter am Eingabefeld
    const peek = document.createElement('div');
    peek.className = 'dog-peek';
    peek.setAttribute('aria-hidden', 'true');
    composer.append(peek);

    // Leerer Chat: der gewählte Hund mittig über dem Eingabefeld (statt oben rechts), darunter „What should we work on today?“
    const hero = document.createElement('div');
    hero.className = 'dog-hero';
    hero.innerHTML = '<button type="button" class="dh-dog" aria-label="Agenten anzeigen" title="Agenten"></button><div class="dh-title">What should we work on today?</div>';
    composer.append(hero);
    const updateHero = (id, animate) => {
      const box = hero.querySelector('.dh-dog');
      if (!animate || reduced() || !box.firstElementChild) { box.innerHTML = heroDog(id); return; }
      box.classList.add('swap'); // weich aus- und wieder einblenden
      setTimeout(() => { box.innerHTML = heroDog(id); box.classList.remove('swap'); }, 220);
    };

    let swapToken = 0;
    selectFn = (id) => { if (id !== mode) select(id); };
    function select(id, animate = true) {
      mode = id;
      try { localStorage.setItem(KEY, id); } catch {}
      chat.dataset.dog = id;
      bar.querySelectorAll('[data-mode]').forEach((b) => {
        const on = b.dataset.mode === id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      pill.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      updateHero(id, animate);
      refreshDocs(id);
      // Antwort, die gerade entsteht oder auf eine Rückfrage wartet: Kopf sofort auf den neuen Agenten
      const lastMsg = chat.querySelector('.msg-ai:last-of-type');
      if (lastMsg && (busy || composer.classList.contains('asking'))) lastMsg.dataset.dog = id;
      document.dispatchEvent(new CustomEvent('dogmodechange', { detail: { id } }));
      // erst taucht der alte Hund ganz hinter dem Rand ab, danach kommt der neue hoch
      const token = ++swapToken;
      const show = () => {
        if (token !== swapToken) return; // inzwischen schon wieder gewechselt
        peek.replaceChildren();
        const sc = scene(id);
        peek.insertAdjacentHTML('beforeend', sc.html);
        if (animate && !reduced()) peek.lastElementChild.classList.add('in');
        play(peek.lastElementChild, sc.tracks);
      };
      const old = peek.querySelector('svg');
      if (!old || !animate || reduced()) return show();
      runners.forEach((r) => r.stop());
      old.classList.remove('in');
      old.classList.add('out');
      let done = false;
      const next = () => { if (!done) { done = true; show(); } };
      old.addEventListener('animationend', next, { once: true });
      setTimeout(next, 400); // falls das Animationsende ausbleibt
    }

    bar.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-mode]');
      if (pick && pick.dataset.mode !== mode && !UNAVAILABLE.has(pick.dataset.mode)) select(pick.dataset.mode);
    });

    // Neue KI-Antworten merken sich den Hund, der beim Senden gewählt war
    new MutationObserver((list) => list.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList.contains('msg-ai') && !n.dataset.dog) n.dataset.dog = mode;
    }))).observe(chat, { childList: true });

    // Klick auf den Begleiter (bzw. den großen Hund) → Agenten-Feld über dem Eingabefeld
    peek.removeAttribute('aria-hidden');
    peek.setAttribute('role', 'button');
    peek.setAttribute('aria-label', 'Agenten anzeigen');
    peek.title = 'Agenten';
    makePicker(composer, [peek, hero.querySelector('.dh-dog')], (id) => select(id));

    // Dokument-Chat: Begleiter, mittiger Hund und Agenten-Feld an jedes Eingabefeld hängen – auch wenn das Seitenfenster neu gebaut wird
    const scanDocs = () => document.querySelectorAll('.dcc-form:not([data-dogs])').forEach(attachDoc);
    new MutationObserver(scanDocs).observe(document.body, { childList: true, subtree: true });
    scanDocs();

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
      const sync = () => setBusy(sendBtn.classList.contains('running'));
      new MutationObserver(sync).observe(sendBtn, { attributes: true, attributeFilter: ['class'] });
      sync();
    }

    select(mode, false);

    // Sprach-Agent: statt des alten Gesichts immer der Allgemein-Hund (Kopf aus dem 32er-Raster);
    // darüber das offene Maul (dunkler Spalt, Zunge) – beim Sprechen per CSS im Takt ein-/ausgeblendet
    const mouthPal = { ...DOGS.general[32].pal, r: '#3a1416', q: '#e8838f' };
    const mouth = `<g class="va-mouth">${rects({ rows: ['rrrr', 'aqqa', '.aa.'], pal: mouthPal }, 14, 22)}</g>`;
    document.querySelectorAll('.va-face').forEach((face) => { face.innerHTML = svg('general', 32).replace('</svg>', `${mouth}</svg>`); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  return { DOGS, MODES, UNAVAILABLE, SCENE_W, SCENE_H, sceneTracks, svg, select: (id) => (DOGS[id] && !UNAVAILABLE.has(id) ? selectFn?.(id) : null), rowsOf: (id) => DOGS[id][32], get mode() { return mode; } };
})();
if (typeof window !== 'undefined') window.PixelDogs = PixelDogs;
if (typeof module !== 'undefined') module.exports = PixelDogs;
