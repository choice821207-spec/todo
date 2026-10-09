const STORAGE_KEY = 'todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');

let todos = load();
let filter = 'all';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 저장소를 쓸 수 없어도 현재 화면에서는 계속 동작한다
  }
}

function createItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
  li.dataset.id = todo.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.done;
  checkbox.setAttribute('aria-label', '완료 표시');

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = todo.text;
  text.title = '더블클릭하여 수정';

  const actions = document.createElement('div');
  actions.className = 'actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.textContent = '수정';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete';
  deleteBtn.textContent = '삭제';

  actions.append(editBtn, deleteBtn);
  li.append(checkbox, text, actions);
  return li;
}

function render() {
  const visible = todos.filter(
    (todo) => filter === 'all' || (filter === 'done') === todo.done
  );
  list.replaceChildren(...visible.map(createItem));

  empty.hidden = visible.length > 0;
  empty.textContent =
    todos.length === 0 ? '할 일을 추가해 보세요.' : '표시할 항목이 없습니다.';

  const remaining = todos.filter((todo) => !todo.done).length;
  count.textContent = `남은 할 일 ${remaining}개`;
  clearDone.hidden = remaining === todos.length;

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

function startEdit(li) {
  const todo = todos.find((item) => item.id === li.dataset.id);
  const text = li.querySelector('.text');
  if (!todo || !text) return;

  const edit = document.createElement('input');
  edit.type = 'text';
  edit.className = 'edit';
  edit.value = todo.text;
  edit.maxLength = 200;
  edit.setAttribute('aria-label', '할 일 수정');

  // Enter/Escape 뒤에 이어지는 blur로 두 번 처리되지 않게 한다
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const value = edit.value.trim();
      if (value) {
        todo.text = value;
      } else {
        todos = todos.filter((item) => item.id !== todo.id);
      }
    }
    update();
  };

  edit.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));

  text.replaceWith(edit);
  edit.focus();
  edit.select();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  todos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text,
    done: false,
  });
  input.value = '';
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

list.addEventListener('click', (event) => {
  const li = event.target.closest('.todo-item');
  if (!li) return;

  if (event.target.closest('.delete')) {
    todos = todos.filter((item) => item.id !== li.dataset.id);
    update();
  } else if (event.target.closest('.edit-btn')) {
    startEdit(li);
  }
});

list.addEventListener('dblclick', (event) => {
  if (!event.target.classList.contains('text')) return;
  startEdit(event.target.closest('.todo-item'));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    render();
  });
});

clearDone.addEventListener('click', () => {
  todos = todos.filter((todo) => !todo.done);
  update();
});

render();
