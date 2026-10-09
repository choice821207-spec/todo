// 실제 index.html과 app.js를 jsdom에 올려 화면 동작을 확인한다
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs
  .readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script src="app.js"></script>', '');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const SEED = [
  { id: 'a', text: 'A', done: false },
  { id: 'b', text: 'B', done: false },
  { id: 'c', text: 'C', done: true },
];

// storage: 앱을 시작하기 전에 localStorage에 넣어 둘 값
function boot(storage = { todos: JSON.stringify(SEED) }, { breakSave } = {}) {
  const { window } = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
  });
  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }
  if (breakSave) {
    window.Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  }
  window.eval(script);

  const document = window.document;
  const app = {
    window,
    document,
    $: (id) => document.getElementById(id),
    items: () => [...document.querySelectorAll('.todo-item')],
    item: (id) => document.querySelector(`.todo-item[data-id="${id}"]`),
    ids: () => app.items().map((li) => li.dataset.id),
    texts: () => app.items().map((li) => li.querySelector('.text').textContent),
    saved: () => JSON.parse(window.localStorage.getItem('todos')),
    savedIds: () => app.saved().map((todo) => todo.id),
    active: () => document.activeElement,
    add(text) {
      app.$('todo-input').value = text;
      app
        .$('todo-form')
        .dispatchEvent(
          new window.Event('submit', { bubbles: true, cancelable: true }),
        );
    },
    filter: (name) => document.querySelector(`[data-filter="${name}"]`).click(),
    // 눌린 키를 앱이 가로챘는지 돌려준다
    key(element, key, options = {}) {
      const event = new window.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    mousedown(element) {
      const event = new window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    // 항목의 수정을 시작하고 입력란을 돌려준다
    edit(id, value) {
      app.item(id).querySelector('.edit-btn').click();
      const edit = app.item(id).querySelector('.edit');
      if (value !== undefined) edit.value = value;
      return edit;
    },
    storageEvent(key, newValue) {
      window.dispatchEvent(
        new window.StorageEvent('storage', {
          key,
          newValue,
          storageArea: window.localStorage,
        }),
      );
    },
  };
  return app;
}

const checkbox = (li) => li.querySelector('input[type="checkbox"]');
const label = (element) => element.getAttribute('aria-label');

test('추가하면 목록 끝에 붙고 저장된다', () => {
  const app = boot();
  app.add('  D  ');
  assert.deepEqual(app.texts(), ['A', 'B', 'C', 'D']);
  assert.equal(app.saved()[3].text, 'D');
  assert.equal(app.saved()[3].done, false);
  assert.equal(app.$('todo-input').value, '');
  assert.equal(app.$('save-error').hidden, true);
});

test('공백만 입력하면 추가하지 않고 입력란을 비워 포커스를 준다', () => {
  const app = boot();
  app.$('toggle-all').focus();
  app.add('   ');
  assert.equal(app.items().length, 3);
  assert.equal(app.$('todo-input').value, '');
  assert.equal(app.active(), app.$('todo-input'));
});

test('체크하면 완료로 저장되고 포커스가 남는다', () => {
  const app = boot();
  const box = checkbox(app.item('a'));
  box.focus();
  box.click();
  assert.equal(app.saved()[0].done, true);
  assert.ok(app.item('a').classList.contains('done'));
  assert.equal(app.active(), box);
  assert.equal(app.$('count').textContent, '남은 할 일 1개');

  app.item('b').querySelector('label.check').click();
  assert.equal(app.saved()[1].done, true);
});

test('필터는 해당 항목만 보여 주고 순서를 유지한다', () => {
  const app = boot();
  app.filter('done');
  assert.deepEqual(app.ids(), ['c']);
  app.filter('active');
  assert.deepEqual(app.ids(), ['a', 'b']);
  app.filter('all');
  assert.deepEqual(app.ids(), ['a', 'b', 'c']);
});

test('선택한 필터는 다시 열어도 유지된다', () => {
  const app = boot();
  app.filter('done');
  assert.equal(app.window.localStorage.getItem('todos-filter'), 'done');

  const todos = JSON.stringify(SEED);
  const reopened = boot({ todos, 'todos-filter': 'done' });
  assert.deepEqual(reopened.ids(), ['c']);
  assert.equal(
    reopened.document
      .querySelector('[data-filter="done"]')
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(boot({ todos, 'todos-filter': 'bogus' }).items().length, 3);
});

test('수정: Enter로 저장, Esc로 취소, 저장 버튼으로 저장', () => {
  const app = boot();
  const li = app.item('a');
  const button = li.querySelector('.edit-btn');

  let edit = app.edit('a', 'A2');
  assert.equal(button.textContent, '저장');
  app.key(edit, 'Enter');
  assert.equal(app.saved()[0].text, 'A2');
  assert.equal(button.textContent, '수정');
  assert.equal(app.active(), button);

  edit = app.edit('a', 'zzz');
  app.key(edit, 'Escape');
  assert.equal(li.querySelector('.text').textContent, 'A2');
  assert.equal(app.saved()[0].text, 'A2');
  assert.equal(app.active(), button);

  // 저장 버튼은 포커스 이동(blur)을 막고 저장만 한다
  assert.equal(app.mousedown(button), false);
  app.edit('a', 'A3');
  assert.equal(app.mousedown(button), true);
  button.click();
  assert.equal(li.querySelector('.edit'), null);
  assert.equal(app.saved()[0].text, 'A3');
  assert.equal(app.active(), button);
});

test('수정 중 다른 항목을 눌러도 한 번에 처리된다', () => {
  const app = boot();
  const a = app.item('a');
  const b = app.item('b');
  const box = checkbox(b);

  app.edit('a', 'A2');
  box.focus(); // 누르는 순간 수정 입력란이 포커스를 잃고 저장된다
  assert.equal(app.item('a'), a);
  assert.equal(app.item('b'), b);
  assert.equal(a.querySelector('.text').textContent, 'A2');
  assert.equal(app.active(), box);
  box.click();
  assert.equal(app.saved()[1].done, true);

  app.edit('a');
  b.querySelector('.delete').focus();
  b.querySelector('.delete').click();
  assert.deepEqual(app.savedIds(), ['a', 'c']);
});

test('항목마다 내용을 담은 레이블이 붙고 수정하면 따라 바뀐다', () => {
  const app = boot();
  const li = app.item('a');
  const names = () =>
    [checkbox(li), ...li.querySelectorAll('.actions button')].map(label);
  assert.deepEqual(names(), [
    'A 완료 표시',
    'A 위로 이동',
    'A 아래로 이동',
    'A 수정',
    'A 삭제',
  ]);

  const edit = app.edit('a', 'A9');
  assert.equal(label(li.querySelector('.edit-btn')), 'A 저장');
  app.key(edit, 'Enter');
  assert.deepEqual(names(), [
    'A9 완료 표시',
    'A9 위로 이동',
    'A9 아래로 이동',
    'A9 수정',
    'A9 삭제',
  ]);
  assert.equal(app.$('count').getAttribute('role'), 'status');
  assert.equal(app.$('empty').getAttribute('role'), 'status');
});

test('삭제하면 이웃 항목으로, 목록이 비면 안내문으로 포커스가 간다', () => {
  const app = boot();
  app.item('a').querySelector('.delete').click();
  assert.equal(app.active(), app.item('b').querySelector('.delete'));
  app.item('c').querySelector('.delete').click();
  assert.equal(app.active(), app.item('b').querySelector('.delete'));

  // 내용을 비우고 저장하면 삭제
  app.key(app.edit('b', '  '), 'Enter');
  assert.equal(app.items().length, 0);
  assert.equal(app.$('empty').hidden, false);
  assert.equal(app.$('empty').textContent, '할 일을 추가해 보세요.');
  assert.equal(app.active(), app.$('empty'));
});

test('삭제는 버튼으로 원래 위치에 되돌릴 수 있다', () => {
  const app = boot();
  assert.equal(app.$('notice').hidden, true);
  app.item('b').querySelector('.delete').click();
  assert.equal(app.$('notice').hidden, false);
  assert.equal(app.$('undo').hidden, false);
  assert.equal(app.$('notice-text').textContent, '항목 1개를 삭제했습니다.');

  app.$('undo').click();
  assert.deepEqual(app.savedIds(), ['a', 'b', 'c']);
  assert.deepEqual(app.ids(), ['a', 'b', 'c']);
  assert.equal(app.$('notice').hidden, true);
  assert.equal(app.active(), checkbox(app.item('b')));
});

test('완료 항목 삭제도 목록이 바뀐 뒤 Ctrl+Z로 되돌릴 수 있다', () => {
  const app = boot();
  checkbox(app.item('a')).click();
  app.$('clear-done').click();
  assert.deepEqual(app.ids(), ['b']);
  assert.equal(app.$('clear-done').hidden, true);
  assert.equal(app.active(), checkbox(app.item('b')));
  assert.equal(app.$('notice-text').textContent, '항목 2개를 삭제했습니다.');

  app.add('N');
  // 글자를 입력하는 중에는 가로채지 않는다
  assert.equal(app.key(app.$('todo-input'), 'z', { ctrlKey: true }), false);
  assert.equal(app.key(app.$('toggle-all'), 'z', { ctrlKey: true }), true);
  assert.deepEqual(app.texts(), ['A', 'B', 'C', 'N']);
  assert.equal(app.saved().filter((todo) => todo.done).length, 2);
  assert.equal(app.key(app.$('toggle-all'), 'z', { ctrlKey: true }), false);
});

test('안내를 닫으면 되돌리지 않고 막대만 사라진다', () => {
  const app = boot();
  app.item('a').querySelector('.delete').click();
  app.$('notice-close').click();
  assert.equal(app.$('notice').hidden, true);
  assert.deepEqual(app.ids(), ['b', 'c']);
  assert.equal(app.key(app.$('toggle-all'), 'z', { ctrlKey: true }), false);
});

test('모두 완료와 모두 해제', () => {
  const app = boot();
  const button = app.$('toggle-all');
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, '모두 완료');

  button.click();
  assert.ok(app.saved().every((todo) => todo.done));
  assert.equal(button.textContent, '모두 해제');
  assert.equal(app.$('count').textContent, '남은 할 일 0개');

  button.click();
  assert.ok(app.saved().every((todo) => !todo.done));
  assert.equal(app.$('clear-done').hidden, true);
  assert.equal(boot({ todos: '[]' }).$('toggle-all').hidden, true);
});

test('위아래 버튼으로 순서를 바꾼다', () => {
  const app = boot();
  const disabled = (id, selector) =>
    app.item(id).querySelector(selector).getAttribute('aria-disabled');
  assert.equal(disabled('a', '.move-up'), 'true');
  assert.equal(disabled('a', '.move-down'), 'false');
  assert.equal(disabled('c', '.move-down'), 'true');

  app.item('a').querySelector('.move-up').click();
  assert.deepEqual(app.savedIds(), ['a', 'b', 'c']);

  const c = app.item('c');
  const up = c.querySelector('.move-up');
  up.focus();
  up.click();
  assert.deepEqual(app.savedIds(), ['a', 'c', 'b']);
  assert.deepEqual(app.ids(), ['a', 'c', 'b']);
  assert.equal(app.item('c'), c);
  assert.equal(app.active(), up);

  up.click();
  assert.deepEqual(app.savedIds(), ['c', 'a', 'b']);
  assert.equal(disabled('c', '.move-up'), 'true');
  assert.equal(disabled('a', '.move-up'), 'false');

  c.querySelector('.move-down').click();
  c.querySelector('.move-down').click();
  assert.deepEqual(app.savedIds(), ['a', 'b', 'c']);
});

test('필터가 걸려 있으면 보이는 이웃 항목을 기준으로 옮긴다', () => {
  const app = boot();
  checkbox(app.item('a')).click();
  app.filter('done');
  assert.deepEqual(app.ids(), ['a', 'c']);
  app.item('c').querySelector('.move-up').click();
  assert.deepEqual(app.savedIds(), ['c', 'a', 'b']);
});

test('저장된 값에서 잘못된 항목과 겹치는 id는 버린다', () => {
  const todos = JSON.stringify([
    null,
    1,
    'x',
    { id: 'a', text: 'A', done: false },
    { id: 'a', text: 'dup', done: false },
    { id: 5, text: 'n', done: false },
    { id: 'e', text: 'E' },
    { id: 'f', text: 'F', done: true, extra: 1 },
    { id: '', text: '', done: false },
  ]);
  assert.deepEqual(boot({ todos }).ids(), ['a', 'f']);
  assert.equal(boot({ todos: '{"a":1}' }).items().length, 0);
  assert.equal(boot({ todos: 'not json' }).items().length, 0);
  assert.equal(boot({}).items().length, 0);
});

test('저장에 실패하면 안내를 보여 주고 화면은 계속 동작한다', () => {
  const app = boot(undefined, { breakSave: true });
  assert.equal(app.$('save-error').hidden, true);
  checkbox(app.item('a')).click();
  assert.equal(app.$('save-error').hidden, false);
  assert.ok(app.item('a').classList.contains('done'));
});

test('다른 탭의 변경을 따라가고 수정 중인 입력란은 유지한다', () => {
  const app = boot();
  const a = app.item('a');
  const edit = app.edit('b', 'B-edit');

  app.storageEvent('other', '[]');
  assert.equal(app.items().length, 3);

  app.storageEvent(
    'todos',
    JSON.stringify([
      { id: 'a', text: 'A!', done: true },
      { id: 'b', text: 'B', done: false },
      { id: 'z', text: 'Z', done: false },
    ]),
  );
  assert.deepEqual(app.ids(), ['a', 'b', 'z']);
  assert.equal(app.item('a'), a);
  assert.equal(a.querySelector('.text').textContent, 'A!');
  assert.equal(checkbox(a).checked, true);
  assert.equal(app.active(), edit);

  app.key(edit, 'Enter');
  assert.deepEqual(
    app.saved().map((todo) => todo.text),
    ['A!', 'B-edit', 'Z'],
  );

  // 수정 중인 항목이 다른 탭에서 지워진 경우
  app.edit('z');
  app.storageEvent(
    'todos',
    JSON.stringify([{ id: 'a', text: 'A!', done: true }]),
  );
  assert.deepEqual(app.ids(), ['a']);

  // 저장소 전체가 비워진 경우
  app.storageEvent(null, null);
  assert.equal(app.items().length, 0);
  assert.equal(app.$('empty').hidden, false);
});

test('내보내기는 현재 목록을 JSON 파일로 내려받는다', async () => {
  const app = boot();
  let blob = null;
  let name = null;
  app.window.URL.createObjectURL = (value) => {
    blob = value;
    return 'blob:todos';
  };
  app.window.URL.revokeObjectURL = () => {};
  app.window.HTMLAnchorElement.prototype.click = function () {
    name = this.download;
  };

  app.$('export').click();
  const text = await new Promise((resolve) => {
    const reader = new app.window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });
  assert.match(name, /^todos-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(JSON.parse(text), SEED);
});

test('가져오기는 목록에 없는 항목만 추가한다', async () => {
  const app = boot();
  const pick = async (content) => {
    Object.defineProperty(app.$('import-file'), 'files', {
      value: [{ text: async () => content }],
      configurable: true,
    });
    app.$('import-file').dispatchEvent(new app.window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const message = () => app.$('notice-text').textContent;

  await pick(
    JSON.stringify([
      { id: 'a', text: 'changed', done: true },
      { id: 'x', text: 'X', done: true },
      null,
      { id: 'y', text: 'Y', done: false },
    ]),
  );
  assert.deepEqual(app.savedIds(), ['a', 'b', 'c', 'x', 'y']);
  assert.equal(app.saved()[0].text, 'A');
  assert.equal(message(), '항목 2개를 가져왔습니다.');
  assert.equal(app.$('undo').hidden, true);

  await pick(JSON.stringify(SEED));
  assert.equal(message(), '새로 가져올 항목이 없습니다.');

  await pick('hello');
  assert.equal(message(), '할 일 목록 파일이 아닙니다.');
  await pick('{"a":1}');
  assert.equal(message(), '할 일 목록 파일이 아닙니다.');
  assert.equal(app.saved().length, 5);
});
