import { parseFurigana, furiganaBase, furiganaReading } from '../furigana';
import { htmlToText, stripBracketFurigana } from '../html';
import { hasKanji, isKanaOnly, removeJapaneseSpaces, toHiragana } from '../japanese';
import { expandVariants } from '../variants';

describe('japanese', () => {
  it('classifies characters', () => {
    expect(hasKanji('ご主人')).toBe(true);
    expect(hasKanji('ガンガン')).toBe(false);
    expect(hasKanji('段々')).toBe(true);
    expect(isKanaOnly('おばさん')).toBe(true);
    expect(isKanaOnly('〜ちゃく')).toBe(true);
    expect(isKanaOnly('父')).toBe(false);
    expect(isKanaOnly('')).toBe(false);
  });

  it('converts katakana to hiragana', () => {
    expect(toHiragana('ガンガン')).toBe('がんがん');
    expect(toHiragana('コーヒー')).toBe('こーひー');
  });

  it('removes spaces inside Japanese text only', () => {
    expect(removeJapaneseSpaces('お疲れ様 でした')).toBe('お疲れ様でした');
    expect(removeJapaneseSpaces('エンジニア　2人　です')).toBe('エンジニア2人です');
    expect(removeJapaneseSpaces('Kseniia Ivanova')).toBe('Kseniia Ivanova');
  });
});

describe('htmlToText', () => {
  it('strips tags, entities and ruby readings', () => {
    expect(htmlToText('&nbsp;げつようび')).toBe('げつようび');
    expect(htmlToText('<div><div>緊張</div></div>')).toBe('緊張');
    expect(htmlToText('<span style="color: rgb(255, 255, 255);">夫</span>')).toBe('夫');
    expect(htmlToText('<ruby>父<rp>(</rp><rt>ちち</rt><rp>)</rp></ruby>')).toBe('父');
    expect(htmlToText('<ruby>兄</ruby><ruby>弟<rt><br><br></rt></ruby>')).toBe('兄弟');
    expect(htmlToText('a &amp; b &#x41;&#66;')).toBe('a & b AB');
  });

  it('keeps line breaks from <br> and blocks', () => {
    expect(htmlToText('旨く<br>上手く<br>巧く')).toBe('旨く\n上手く\n巧く');
    expect(htmlToText('<div>ваше мнение<br></div>')).toBe('ваше мнение');
  });

  it('removes Anki media', () => {
    expect(htmlToText('猫[sound:neko.mp3]<img src="cat.jpg">')).toBe('猫');
  });

  it('strips bracket furigana', () => {
    expect(stripBracketFurigana('日本[にほん] 語[ご]')).toBe('日本語');
    expect(stripBracketFurigana('AはB[note]')).toBe('AはB[note]');
  });
});

describe('parseFurigana', () => {
  it('parses ruby with <rp>', () => {
    expect(parseFurigana('<ruby>父<rp>(</rp><rt>ちち</rt><rp>)</rp></ruby>')).toEqual([
      { text: '父', reading: 'ちち' },
    ]);
  });

  it('keeps one reading per kanji and plain kana between them', () => {
    const segments = parseFurigana(
      'ご<ruby>主<rp>(</rp><rt>しゅ</rt><rp>)</rp></ruby><ruby>人<rp>(</rp><rt>じん</rt><rp>)</rp></ruby>',
    );
    expect(segments).toEqual([
      { text: 'ご' },
      { text: '主', reading: 'しゅ' },
      { text: '人', reading: 'じん' },
    ]);
    expect(furiganaBase(segments)).toBe('ご主人');
    expect(furiganaReading(segments)).toBe('ごしゅじん');
  });

  it('keeps multi-kanji blocks (jukujikun) together', () => {
    expect(parseFurigana('お<ruby>祖父<rp>(</rp><rt>じい</rt><rp>)</rp></ruby>さん')).toEqual([
      { text: 'お' },
      { text: '祖父', reading: 'じい' },
      { text: 'さん' },
    ]);
  });

  it('parses ruby without <rp> and with several pairs inside one element', () => {
    expect(parseFurigana('<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>')).toEqual([
      { text: '漢', reading: 'かん' },
      { text: '字', reading: 'じ' },
    ]);
  });

  it('cleans readings and ignores empty ones', () => {
    expect(parseFurigana('<ruby>毎<rt>まい</rt></ruby><ruby>月<rt>つき<br><br></rt></ruby>')).toEqual([
      { text: '毎', reading: 'まい' },
      { text: '月', reading: 'つき' },
    ]);
    expect(parseFurigana('〜<ruby>着<rt></rt></ruby>')).toEqual([{ text: '〜着' }]);
  });

  it('moves okurigana out of the annotated part', () => {
    expect(parseFurigana('<ruby>食べる<rt>たべる</rt></ruby>')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' },
    ]);
  });

  it('ignores formatting tags around ruby', () => {
    expect(
      parseFurigana('<font color="#ff0000"><ruby>電<rt>でん</rt></ruby><ruby>池<rt>ち</rt></ruby></font>が切れる'),
    ).toEqual([{ text: '電', reading: 'でん' }, { text: '池', reading: 'ち' }, { text: 'が切れる' }]);
  });

  it('parses Anki bracket furigana', () => {
    expect(parseFurigana('日本語[にほんご]を 勉強[べんきょう]する')).toEqual([
      { text: '日本語', reading: 'にほんご' },
      { text: 'を' },
      { text: '勉強', reading: 'べんきょう' },
      { text: 'する' },
    ]);
    expect(parseFurigana('お茶[おちゃ]')).toEqual([{ text: 'お' }, { text: '茶', reading: 'ちゃ' }]);
  });
});

describe('expandVariants', () => {
  it('expands alternatives in parentheses', () => {
    expect(expandVariants('(伯/叔)母さん')).toEqual(['伯母さん', '叔母さん']);
  });

  it('treats parentheses without a separator as optional', () => {
    expect(expandVariants('まわり(に)')).toEqual(['まわりに', 'まわり']);
  });

  it('splits lists on line breaks and slashes', () => {
    expect(expandVariants('旨く\n上手く\n巧く')).toEqual(['旨く', '上手く', '巧く']);
    expect(expandVariants('返事をする / 返信する')).toEqual(['返事をする', '返信する']);
  });

  it('removes spaces and duplicates', () => {
    expect(expandVariants('お疲れ様 でした')).toEqual(['お疲れ様でした']);
    expect(expandVariants('父\n父')).toEqual(['父']);
    expect(expandVariants('')).toEqual([]);
  });
});
