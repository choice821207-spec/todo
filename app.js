const STORAGE_KEY = 'todos';
const FILTER_KEY = 'todos-filter';
const FILTERS = ['all', 'active', 'done'];

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const toggleAll = document.getElementById('toggle-all');
const saveError = document.getElementById('save-error');
const notice = document.getElementById('notice');
const noticeText = document.getElementById('notice-text');
const undoBtn = document.getElementById('undo');
const noticeClose = document.getElementById('notice-close');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('import-file');
const filterButtons = document.querySelectorAll('.filters button');

let todos = load();
let filter = loadFilter();
// 안내 막대에 보여 줄 문구. 비어 있으면 막대를 숨긴다
let message = '';
// 마지막으로 지운 항목과 원래 위치. 실행 취소에 쓴다
let removed = [];

function isValidTodo(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    item.id !== '' &&
    typeof item.text === 'string' &&
    typeof item.done === 'boolean'
  );
}

// 형식이 맞지 않거나 id가 겹치는 항목은 버린다. 목록이 아니면 null
function parse(raw) {
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return null;

    const seen = new Set();
    return saved
      .filter((item) => {
        if (!isValidTodo(item) || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .map(({ id, text, done }) => ({ id, text, done }));
  } catch {
    return null;
  }
}

function load() {
  try {
    return parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function loadFilter() {
  try {
    const saved = localStorage.getItem(FILTER_KEY);
    return FILTERS.includes(saved) ? saved : 'all';
  } catch {
    return 'all';
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    saveError.hidden = true;
  } catch {
    // 저장소를 쓸 수 없어도 현재 화면에서는 계속 동작한다
    saveError.hidden = false;
  }
}

function createButton(className, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function createItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
  li.dataset.id = todo.id;

  // 터치 화면에서 누르는 영역을 넓히기 위해 label로 감싼다
  const check = document.createElement('label');
  check.className = 'check';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.done;
  check.append(checkbox);

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = todo.text;
  text.title = '더블클릭하여 수정';

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    createButton('move-up', '↑'),
    createButton('move-down', '↓'),
    createButton('edit-btn', '수정'),
    createButton('delete', '삭제'),
  );

  li.append(check, text, actions);
  setLabels(li, todo.text);
  return li;
}

// 스크린 리더에서 어느 항목의 컨트롤인지 알 수 있게 한다
function setLabels(li, text) {
  const editBtn = li.querySelector('.edit-btn');
  li.querySelector('input[type="checkbox"]').setAttribute(
    'aria-label',
    `${text} 완료 표시`,
  );
  li.querySelector('.move-up').setAttribute('aria-label', `${text} 위로 이동`);
  li.querySelector('.move-down').setAttribute(
    'aria-label',
    `${text} 아래로 이동`,
  );
  editBtn.setAttribute('aria-label', `${text} ${editBtn.textContent}`);
  li.querySelector('.delete').setAttribute('aria-label', `${text} 삭제`);
}

// 포커스가 있던 요소가 사라질 때 옮겨 갈 곳: 주어진 항목, 없으면 빈 목록 안내
function focusItem(li, selector) {
  const target = li && li.isConnected ? li.querySelector(selector) : empty;
  target.focus();
}

function syncItem(li, todo) {
  li.classList.toggle('done', todo.done);
  li.querySelector('input[type="checkbox"]').checked = todo.done;
  // 수정 중인 항목에는 .text가 없다
  const text = li.querySelector('.text');
  if (text) text.textContent = todo.text;
  setLabels(li, todo.text);
}

// 같은 내용을 다시 쓰면 스크린 리더가 또 읽으므로 바뀔 때만 쓴다
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function visibleTodos() {
  return todos.filter(
    (todo) => filter === 'all' || (filter === 'done') === todo.done,
  );
}

// 목록을 통째로 교체하면 누르던 버튼과 수정 중인 입력란이 사라지므로
// 기존 요소는 그대로 두고 달라진 부분만 고친다
function renderList(visible) {
  const visibleIds = new Set(visible.map((todo) => todo.id));
  const items = new Map();
  for (const li of [...list.children]) {
    if (visibleIds.has(li.dataset.id)) {
      items.set(li.dataset.id, li);
    } else {
      li.remove();
    }
  }

  let next = list.firstElementChild;
  for (const todo of visible) {
    if (next && next.dataset.id === todo.id) {
      syncItem(next, todo);
      next = next.nextElementSibling;
      continue;
    }

    let li = items.get(todo.id);
    if (li) {
      syncItem(li, todo);
    } else {
      li = createItem(todo);
    }
    list.insertBefore(li, next);
  }

  // disabled로 막으면 누르던 버튼에서 포커스가 사라지므로 aria-disabled를 쓴다
  const last = list.children.length - 1;
  [...list.children].forEach((li, index) => {
    li.querySelector('.move-up').setAttribute('aria-disabled', index === 0);
    li.querySelector('.move-down').setAttribute(
      'aria-disabled',
      index === last,
    );
  });
}

function render() {
  const visible = visibleTodos();
  renderList(visible);

  empty.hidden = visible.length > 0;
  setText(
    empty,
    todos.length === 0 ? '할 일을 추가해 보세요.' : '표시할 항목이 없습니다.',
  );

  const remaining = todos.filter((todo) => !todo.done).length;
  setText(count, `남은 할 일 ${remaining}개`);
  clearDone.hidden = remaining === todos.length;
  toggleAll.hidden = todos.length === 0;
  setText(toggleAll, remaining === 0 ? '모두 해제' : '모두 완료');

  notice.hidden = message === '';
  setText(noticeText, message);
  undoBtn.hidden = removed.length === 0;

  filterButtons.forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
}

function update() {
  save();
  render();
}

function removeTodos(shouldRemove) {
  const gone = [];
  todos = todos.filter((todo, index) => {
    if (!shouldRemove(todo)) return true;
    gone.push({ todo, index });
    return false;
  });
  if (gone.length > 0) {
    removed = gone;
    message = `항목 ${gone.length}개를 삭제했습니다.`;
  }
  update();
}

function undo() {
  if (removed.length === 0) return;
  const restored = removed;
  removed = [];
  message = '';

  // 그사이 목록이 바뀌었을 수 있으므로 원래 위치에 가장 가깝게 끼워 넣는다
  for (const { todo, index } of restored) {
    if (todos.some((item) => item.id === todo.id)) continue;
    todos.splice(Math.min(index, todos.length), 0, todo);
  }
  update();

  // 버튼이 숨겨지므로 되살린 항목으로 포커스를 옮긴다
  const ids = new Set(restored.map(({ todo }) => todo.id));
  const li = [...list.children].find((item) => ids.has(item.dataset.id));
  focusItem(li || list.firstElementChild, 'input[type="checkbox"]');
}

// 현재 필터에서 보이는 순서를 기준으로 한 칸 옮긴다
function move(id, step) {
  const visible = visibleTodos();
  const from = visible.findIndex((todo) => todo.id === id);
  const target = visible[from + step];
  if (from === -1 || !target) return;

  const todo = visible[from];
  todos = todos.filter((item) => item !== todo);
  todos.splice(todos.indexOf(target) + (step > 0 ? 1 : 0), 0, todo);
  update();
}

// 지금 목록에 없는 항목만 뒤에 추가한다
function importTodos(raw) {
  const imported = parse(raw);
  const ids = new Set(todos.map((todo) => todo.id));
  const added = (imported || []).filter((todo) => !ids.has(todo.id));

  removed = [];
  if (!imported) {
    message = '할 일 목록 파일이 아닙니다.';
  } else if (added.length === 0) {
    message = '새로 가져올 항목이 없습니다.';
  } else {
    message = `항목 ${added.length}개를 가져왔습니다.`;
  }
  todos = todos.concat(added);
  update();
}

function startEdit(li) {
  const id = li.dataset.id;
  const todo = todos.find((item) => item.id === id);
  const text = li.querySelector('.text');
  const editBtn = li.querySelector('.edit-btn');
  if (!todo || !text) return;

  const edit = document.createElement('input');
  edit.type = 'text';
  edit.className = 'edit';
  edit.value = todo.text;
  edit.maxLength = 200;
  edit.setAttribute('aria-label', '할 일 수정');

  // Enter/Escape 뒤에 이어지는 blur로 두 번 처리되지 않게 한다
  let finished = false;
  // refocus: 키보드로 끝냈을 때 포커스를 항목으로 되돌린다
  const finish = (commit, refocus) => {
    if (finished) return;
    finished = true;
    edit.replaceWith(text);
    editBtn.textContent = '수정';
    setLabels(li, text.textContent);
    const neighbor = li.nextElementSibling || li.previousElementSibling;

    // 수정하는 동안 다른 탭에서 목록이 바뀌었을 수 있으므로 다시 찾는다
    const current = commit && todos.find((item) => item.id === id);
    if (current) {
      const value = edit.value.trim();
      if (value) {
        current.text = value;
        update();
      } else {
        removeTodos((item) => item.id === id);
      }
    }

    if (!refocus) return;
    if (li.isConnected) {
      editBtn.focus();
    } else {
      focusItem(neighbor, '.edit-btn');
    }
  };

  edit.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') finish(true, true);
    if (event.key === 'Escape') finish(false, true);
  });
  edit.addEventListener('blur', () => finish(true, false));

  text.replaceWith(edit);
  editBtn.textContent = '저장';
  setLabels(li, todo.text);
  edit.focus();
  edit.select();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  input.value = '';
  if (!text) {
    // 공백만 입력했으면 비우고 다시 입력하게 한다
    input.focus();
    return;
  }

  todos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text,
    done: false,
  });
  update();
});

list.addEventListener('change', (event) => {
  if (event.target.type !== 'checkbox') return;
  const li = event.target.closest('.todo-item');
  const todo = todos.find((item) => item.id === li.dataset.id);
  if (!todo) return;
  todo.done = event.target.checked;
  update();
});

// 수정 중에 '저장' 버튼을 누르면 blur가 먼저 저장해 버려
// 이어지는 클릭이 수정을 다시 열게 되므로 포커스 이동을 막는다
list.addEventListener('mousedown', (event) => {
  const button = event.target.closest('.edit-btn');
  if (button && button.closest('.todo-item').querySelector('.edit')) {
    event.preventDefault();
  }
});

list.addEventListener('click', (event) => {
  const li = event.target.closest('.todo-item');
  if (!li) return;

  const editBtn = event.target.closest('.edit-btn');
  const moveBtn = event.target.closest('.move-up, .move-down');
  if (event.target.closest('.delete')) {
    const neighbor = li.nextElementSibling || li.previousElementSibling;
    removeTodos((item) => item.id === li.dataset.id);
    focusItem(neighbor, '.delete');
  } else if (editBtn) {
    const edit = li.querySelector('.edit');
    if (edit) {
      edit.blur();
      editBtn.focus();
    } else {
      startEdit(li);
    }
  } else if (moveBtn) {
    move(li.dataset.id, moveBtn.classList.contains('move-up') ? -1 : 1);
    // 항목이 옮겨지면서 잃은 포커스를 되돌린다
    moveBtn.focus();
  }
});

list.addEventListener('dblclick', (event) => {
  if (!event.target.classList.contains('text')) return;
  startEdit(event.target.closest('.todo-item'));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    try {
      localStorage.setItem(FILTER_KEY, filter);
    } catch {
      // 필터는 저장하지 못해도 현재 화면에서는 그대로 적용된다
    }
    render();
  });
});

toggleAll.addEventListener('click', () => {
  const done = todos.some((todo) => !todo.done);
  todos.forEach((todo) => {
    todo.done = done;
  });
  update();
});

clearDone.addEventListener('click', () => {
  removeTodos((todo) => todo.done);
  // 버튼이 숨겨지므로 포커스를 목록으로 옮긴다
  focusItem(list.firstElementChild, 'input[type="checkbox"]');
});

undoBtn.addEventListener('click', undo);

noticeClose.addEventListener('click', () => {
  message = '';
  removed = [];
  render();
  // 버튼이 숨겨지므로 포커스를 목록으로 옮긴다
  focusItem(list.firstElementChild, 'input[type="checkbox"]');
});

// 글자를 입력하는 중에는 브라우저의 입력 취소가 동작하게 둔다
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey)
    return;
  if (event.key.toLowerCase() !== 'z' || removed.length === 0) return;
  if (event.target.closest('input[type="text"]')) return;
  event.preventDefault();
  undo();
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(todos, null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `todos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;

  let raw = '';
  try {
    raw = await file.text();
  } catch {
    // 읽지 못한 파일은 잘못된 파일과 같게 안내한다
  }
  // 같은 파일을 다시 고를 수 있게 비운다
  importFile.value = '';
  importTodos(raw);
});

// 다른 탭에서 목록이 바뀌면 따라간다
window.addEventListener('storage', (event) => {
  if (event.storageArea !== localStorage) return;
  // key가 null이면 저장소 전체가 비워진 것이다
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  todos = parse(event.newValue) || [];
  render();
});

render();
