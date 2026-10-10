import { detectDeckKind, detectKanjiColumns, detectWordColumns, profileColumns } from '../detect-columns';
import { importKanji } from '../import-kanji';
import { importWords } from '../import-words';
import { EncodingError, parseWordFile } from '../word-file';

const tsv = (...lines: string[][]) => lines.map((cells) => cells.join('\t')).join('\n');

describe('parseWordFile', () => {
  it('reads Anki header lines', () => {
    const exp = parseWordFile(
      '#separator:tab\n#html:true\n#guid column:1\n#notetype column:2\n#deck column:3\n#tags column:5\n' +
        tsv(['g1', 'Basic', 'Deck::Sub', '父', 'family']),
    );
    expect(exp.meta).toMatchObject({
      separator: '\t',
      html: true,
      guidColumn: 0,
      notetypeColumn: 1,
      deckColumn: 2,
      tagsColumn: 4,
    });
    expect(exp.rows).toEqual([['g1', 'Basic', 'Deck::Sub', '父', 'family']]);
  });

  it('handles quoted fields with separators, quotes and line breaks', () => {
    const exp = parseWordFile('#separator:tab\n"a\tb"\t"say ""hi"""\t"line1\nline2"\r\nnext\t\t\n');
    expect(exp.rows).toEqual([
      ['a\tb', 'say "hi"', 'line1\nline2'],
      ['next', '', ''],
    ]);
  });

  it('strips a BOM and guesses the separator when there is no header', () => {
    const exp = parseWordFile('\uFEFF父;ちち;father\n母;はは;mother');
    expect(exp.meta.separator).toBe(';');
    expect(exp.rows).toEqual([
      ['父', 'ちち', 'father'],
      ['母', 'はは', 'mother'],
    ]);
  });

  it('guesses the separator from consistent column counts', () => {
    // Translations contain ";" but the columns are separated by commas.
    const exp = parseWordFile('父,ちち,father; dad\n母,はは,mother; mom\n兄,あに,older brother');
    expect(exp.meta.separator).toBe(',');
    expect(exp.rows[0]).toEqual(['父', 'ちち', 'father; dad']);
  });

  it('recognizes a header row in plain CSV files', () => {
    expect(parseWordFile('word,reading,meaning\n父,ちち,father\n母,はは,mother').meta.columnNames).toEqual([
      'word',
      'reading',
      'meaning',
    ]);
    expect(parseWordFile('単語\t読み\t意味\n父\tちち\tотец').meta.columnNames).toEqual(['単語', '読み', '意味']);
    // Unknown names, but no Japanese above a Japanese column.
    const custom = parseWordFile('Expression;Yomi;Russian\n父;ちち;отец\n母;はは;мать');
    expect(custom.meta.columnNames).toEqual(['Expression', 'Yomi', 'Russian']);
    expect(custom.rows).toHaveLength(2);
    // The first row is data.
    const plain = parseWordFile('父,ちち,father\n母,はは,mother');
    expect(plain.meta.columnNames).toBeUndefined();
    expect(plain.rows).toHaveLength(2);
  });

  it('rejects files that are not UTF-8', () => {
    expect(() => parseWordFile('\uFFFD\uFFFD,ちち')).toThrow(EncodingError);
  });

  it('reads column names', () => {
    const exp = parseWordFile('#separator:tab\n#columns:Kanji\tReading\tRussian word\n父\tちち\tотец');
    expect(exp.meta.columnNames).toEqual(['Kanji', 'Reading', 'Russian word']);
  });
});

const WORDS = [
  ['父', 'ちち', 'отец', '<ruby>父<rt>ちち</rt></ruby>'],
  ['祖父', 'そふ', 'дедушка', '<ruby>祖<rt>そ</rt></ruby><ruby>父<rt>ふ</rt></ruby>'],
  ['家族', 'かぞく', 'семья', '<ruby>家<rt>か</rt></ruby><ruby>族<rt>ぞく</rt></ruby>'],
  ['ガンガン', 'ガンガン', 'громко', ''],
  ['今年', 'ことし', 'этот год', '<ruby>今年<rt>ことし</rt></ruby>'],
  ['電池が切れる', 'でんちがきれる', 'батарея села', '<ruby>電<rt>でん</rt></ruby><ruby>池<rt>ち</rt></ruby>が<ruby>切<rt>き</rt></ruby>れる'],
];

describe('column detection', () => {
  it('finds word deck columns in any order', () => {
    const shuffled = WORDS.map(([w, r, t, f]) => ['guid', t, f, r, w]);
    const exp = parseWordFile('#separator:tab\n#guid column:1\n' + tsv(...shuffled));
    const profiles = profileColumns(exp);
    expect(detectDeckKind(profiles)).toBe('words');
    expect(detectWordColumns(profiles)).toEqual({ translation: 1, furigana: 2, reading: 3, word: 4 });
  });

  it('uses column names as a hint without being fooled by "Russian word"', () => {
    const exp = parseWordFile(
      '#separator:tab\n#columns:Russian word\tKana\tWord\n' + tsv(...WORDS.map(([w, r, t]) => [t, r, w])),
    );
    expect(detectWordColumns(profileColumns(exp))).toEqual({ translation: 0, reading: 1, word: 2 });
  });

  it('recognizes a kanji deck', () => {
    const rows = [
      ['1', '一', 'one', 'イチ、イツ', 'ひと-、ひと.つ'],
      ['2', '二', 'two', 'ニ、ジ', 'ふた、ふた.つ'],
      ['3', '三', 'three', 'サン、ゾウ', 'み、み.つ'],
      ['4', '四', 'four', 'シ', 'よ、よ.つ、よっ.つ'],
      ['5', '五', 'five', 'ゴ', 'いつ、いつ.つ'],
    ];
    const profiles = profileColumns(parseWordFile('#separator:tab\n' + tsv(...rows)));
    expect(detectDeckKind(profiles)).toBe('kanji');
    expect(detectKanjiColumns(profiles)).toEqual({ frame: 0, kanji: 1, keyword: 2, onyomi: 3, kunyomi: 4 });
  });
});

describe('importWords', () => {
  const mapping = { word: 0, reading: 1, translation: 2, furigana: 3 };

  it('imports notes with furigana and skips kana-only words', () => {
    const result = importWords(parseWordFile('#separator:tab\n' + tsv(...WORDS)), mapping);
    expect(result.notes.map((n) => n.word)).toEqual(['父', '祖父', '家族', '今年', '電池が切れる']);
    expect(result.skipped).toEqual([{ row: 4, reason: 'no-kanji', text: 'ガンガン' }]);
    expect(result.notes[1]).toMatchObject({
      word: '祖父',
      reading: 'そふ',
      translation: 'дедушка',
      furigana: [
        { text: '祖', reading: 'そ' },
        { text: '父', reading: 'ふ' },
      ],
    });
  });

  it('keeps alternative spellings and splits paired lists', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv(
          ['(伯/叔)母さん', 'おばさん', 'тётя', ''],
          ['旨く<br>上手く<br>巧く', 'うまく', 'умело', ''],
          ['返事をする / 返信する', 'へんじをする/へんしんする', 'отвечать', ''],
        ),
    );
    const { notes } = importWords(exp, mapping);
    expect(notes.map(({ word, alternatives, reading }) => ({ word, alternatives, reading }))).toEqual([
      { word: '伯母さん', alternatives: ['叔母さん'], reading: 'おばさん' },
      { word: '旨く', alternatives: ['上手く', '巧く'], reading: 'うまく' },
      { word: '返事をする', alternatives: [], reading: 'へんじをする' },
      { word: '返信する', alternatives: [], reading: 'へんしんする' },
    ]);
  });

  it('prefers furigana spelling when it matches the reading', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv(
          ['そのとおりです', 'そのとおりです', 'именно так', 'その<ruby>通<rt>とお</rt></ruby>りです'],
          ['〜<ruby>着<rt></rt></ruby>着', '〜ちゃく', 'прибытие', '〜<ruby>着<rt>ちゃく</rt></ruby>'],
        ),
    );
    const { notes } = importWords(exp, mapping);
    expect(notes.map((n) => n.word)).toEqual(['その通りです', '〜着']);
  });

  it('keeps the word field when it has kanji, adding the furigana spelling as an alternative', () => {
    const exp = parseWordFile(
      '#separator:tab\n' + tsv(['吊るす', 'つるす', 'вешать', '<ruby>吊<rt>つる</rt></ruby>す']),
    );
    const { notes } = importWords(exp, mapping);
    expect(notes[0]).toMatchObject({ word: '吊るす', alternatives: ['吊す'] });
    expect(notes[0].furigana).toBeUndefined();
  });

  it('matches digits in furigana against any kana', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv(['月に1回', 'つきにいっかい', 'раз в месяц', '<ruby>月<rt>つき</rt></ruby>に1<ruby>回<rt>かい</rt></ruby>']),
    );
    expect(importWords(exp, mapping).notes[0].furigana).toBeDefined();
  });

  it('picks the furigana line that matches the word', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv([
          '旨く<br>上手く',
          'うまく',
          'умело',
          '<ruby>旨<rt>うま</rt></ruby>く<br><ruby>上手<rt>うま</rt></ruby>く',
        ]),
    );
    const { notes } = importWords(exp, mapping);
    expect(notes[0]).toMatchObject({
      word: '旨く',
      alternatives: ['上手く'],
      furigana: [{ text: '旨', reading: 'うま' }, { text: 'く' }],
    });
  });

  it('reports kana-only notes with an empty word field as having no kanji', () => {
    const exp = parseWordFile('#separator:tab\n' + tsv(['', 'ペラペラ', 'бегло', '']));
    expect(importWords(exp, mapping).skipped).toEqual([{ row: 1, reason: 'no-kanji', text: 'ペラペラ' }]);
  });

  it('picks the reading that fits the word when the reading has optional parts', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv(
          ['聞く', '(に)きく', 'спрашивать', ''],
          ['兄', 'あに (き)', 'старший брат', '<ruby>兄<rp>(</rp><rt>あに</rt><rp>)</rp></ruby>'],
          ['周りに', 'まわり(に)', 'вокруг', ''],
        ),
    );
    const { notes, furiganaIgnored } = importWords(exp, mapping);
    expect(notes.map(({ word, reading, readingLabel }) => ({ word, reading, readingLabel }))).toEqual([
      { word: '聞く', reading: 'きく', readingLabel: '(に)きく' },
      { word: '兄', reading: 'あに', readingLabel: 'あに(き)' },
      { word: '周りに', reading: 'まわりに', readingLabel: 'まわり(に)' },
    ]);
    expect(notes[1].furigana).toEqual([{ text: '兄', reading: 'あに' }]);
    expect(furiganaIgnored).toBe(0);
  });

  it('drops furigana that does not match the reading', () => {
    const exp = parseWordFile(
      '#separator:tab\n' + tsv(['毎月', 'まいげつ', 'каждый месяц', '<ruby>毎<rt>まい</rt></ruby><ruby>月<rt>つき</rt></ruby>']),
    );
    const result = importWords(exp, mapping);
    expect(result.notes[0].furigana).toBeUndefined();
    expect(result.furiganaIgnored).toBe(1);
  });

  it('reads bracket furigana from the word field when there is no furigana column', () => {
    const exp = parseWordFile('#separator:tab\n' + tsv(['祖父[そふ]', 'そふ', 'grandfather']));
    const { notes } = importWords(exp, { word: 0, reading: 1, translation: 2 });
    expect(notes[0]).toMatchObject({ word: '祖父', furigana: [{ text: '祖父', reading: 'そふ' }] });
  });

  it('skips duplicates and uses GUIDs as ids', () => {
    const exp = parseWordFile(
      '#separator:tab\n#guid column:1\n' + tsv(['g1', '父', 'ちち', 'отец'], ['g2', '父', 'ちち', 'папа']),
    );
    const result = importWords(exp, { word: 1, reading: 2, translation: 3 });
    expect(result.notes.map((n) => n.id)).toEqual(['g1']);
    expect(result.skipped[0].reason).toBe('duplicate');
  });
});

describe('importKanji', () => {
  it('imports entries, splits variants and readings, merges duplicates', () => {
    const exp = parseWordFile(
      '#separator:tab\n' +
        tsv(
          ['1', '一', 'one', 'イチ、イツ', 'ひと-、ひと.つ'],
          ['', '<img src="primitive.svg">', 'walking stick', '', ''],
          ['2000', '喩・喻', 'metaphor', 'ユ', 'たと.える'],
          ['2500', '一', 'one again', '', ''],
          ['1500', '暑', 'жаркий<br>sultry', 'ショ', 'あつ.い'],
        ),
    );
    const result = importKanji(exp, { frame: 0, kanji: 1, keyword: 2, onyomi: 3, kunyomi: 4 });
    expect(result.skipped).toBe(1);
    expect(result.entries).toEqual([
      { kanji: '一', frame: 1, keyword: 'one', onyomi: ['イチ', 'イツ'], kunyomi: ['ひと-', 'ひと.つ'] },
      { kanji: '喩', frame: 2000, keyword: 'metaphor', onyomi: ['ユ'], kunyomi: ['たと.える'] },
      { kanji: '喻', frame: 2000, keyword: 'metaphor', onyomi: ['ユ'], kunyomi: ['たと.える'] },
      { kanji: '暑', frame: 1500, keyword: 'жаркий / sultry', onyomi: ['ショ'], kunyomi: ['あつ.い'] },
    ]);
  });
});
