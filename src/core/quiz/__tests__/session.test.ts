import { changedKanji, kanjiOf, score, shuffle } from '../session';

describe('session helpers', () => {
  it('shuffles without losing items', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = shuffle(items, () => 0.3);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('lists unique kanji without repeat marks or kana', () => {
    expect(kanjiOf('電池が切れる')).toEqual(['電', '池', '切']);
    expect(kanjiOf('段々')).toEqual(['段']);
    expect(kanjiOf('森林林')).toEqual(['森', '林']);
  });

  it('finds the kanji a wrong answer introduced', () => {
    expect(changedKanji('祖父', '租父')).toEqual(['租']);
    expect(changedKanji('期間', '機関')).toEqual(['機', '関']);
    expect(changedKanji('会社', '社会')).toEqual([]);
  });

  it('scores answers', () => {
    expect(score([{ note: 1, chosen: 'a', correct: true }, { note: 2, chosen: 'b', correct: false }])).toEqual({
      correct: 1,
      total: 2,
    });
  });
});
