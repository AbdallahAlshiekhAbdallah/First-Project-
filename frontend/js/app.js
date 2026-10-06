const API_URL = 'http://localhost:3000/api/expenses';
const CATEGORIES = ['Food', 'Transport', 'Bills', 'Entertainment', 'Other', 'Health'];
const CATEGORY_BADGE_COLORS = {
  Food: 'success',
  Transport: 'info',
  Bills: 'warning',
  Entertainment: 'primary',
  Other: 'secondary',
  Health: 'danger',
};
const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const elements = {
  alerts: document.getElementById('alertContainer'),
  spinner: document.getElementById('loadingSpinner'),
  emptyState: document.getElementById('emptyState'),
  tableBody: document.getElementById('expensesTableBody'),
  filter: document.getElementById('categoryFilter'),
  search: document.getElementById('titleSearch'),
  totalAmount: document.getElementById('totalAmount'),
  expenseCount: document.getElementById('expenseCount'),
  highestExpense: document.getElementById('highestExpense'),
  highestExpenseTitle: document.getElementById('highestExpenseTitle'),
  addForm: document.getElementById('expenseForm'),
  addButton: document.getElementById('submitExpenseBtn'),
  addError: document.getElementById('addFormError'),
  editModal: document.getElementById('editExpenseModal'),
  editForm: document.getElementById('editExpenseForm'),
  editButton: document.getElementById('saveEditBtn'),
  editError: document.getElementById('editFormError'),
};

// This list holds the latest GET response; the database owns the saved data.
let expenses = [];
let editingExpenseId = null;
let editModalShown = false;
let pendingRequestCount = 0;
let expenseChangeInProgress = false;

function showAlert(message, kind = 'danger') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${kind} alert-dismissible fade show`;
  alert.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.textContent = message;
  alert.append(text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-close';
  close.setAttribute('data-bs-dismiss', 'alert');
  close.setAttribute('aria-label', 'Close alert');
  alert.append(close);
  elements.alerts.replaceChildren(alert);
}

function clearFormError(element) {
  if (!element) return;
  element.textContent = '';
  element.hidden = true;
}

function showFormError(element, message) {
  if (element) {
    element.textContent = message;
    element.hidden = false;
  }
}

function updateSpinner() {
  elements.spinner.hidden = pendingRequestCount === 0;
}

// All four HTTP methods share network, status, and response handling.
async function requestJson(url, options = {}) {
  pendingRequestCount += 1;
  updateSpinner();
  try {
    const response = await fetch(url, options);
    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        if (response.ok) throw new Error('The server returned an invalid response.');
      }
    }

    if (!response.ok) {
      const serverMessage = data && typeof data.message === 'string' && data.message.trim();
      throw new Error(serverMessage || `The server returned an error (${response.status}).`);
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not connect to the expense server. Make sure the backend is running at http://localhost:3000.');
    }
    throw error;
  } finally {
    pendingRequestCount -= 1;
    updateSpinner();
  }
}

async function getExpenses() {
  const list = await requestJson(API_URL);
  if (!Array.isArray(list)) throw new Error('The server returned an invalid expense list.');
  return list;
}

async function addExpense(data) {
  return requestJson(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function updateExpense(id, data) {
  return requestJson(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function deleteExpense(id) {
  return requestJson(`${API_URL}/${id}`, { method: 'DELETE' });
}

function renderSummary(list) {
  let total = 0;
  let highest = null;
  for (const expense of list) {
    const amount = Number(expense.amount);
    total += amount;
    if (!highest || amount > Number(highest.amount)) highest = expense;
  }
  elements.totalAmount.textContent = amountFormatter.format(total);
  elements.expenseCount.textContent = String(list.length);
  elements.highestExpense.textContent = amountFormatter.format(highest ? Number(highest.amount) : 0);
  if (elements.highestExpenseTitle) {
    elements.highestExpenseTitle.textContent = highest ? highest.title : 'No expenses yet';
  }
}

function makeCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function renderTable(list) {
  elements.tableBody.replaceChildren();
  elements.emptyState.hidden = list.length !== 0;

  for (const expense of list) {
    const row = document.createElement('tr');
    row.append(makeCell(expense.title));
    row.append(makeCell(amountFormatter.format(Number(expense.amount))));

    const categoryCell = document.createElement('td');
    const badge = document.createElement('span');
    const badgeColor = CATEGORY_BADGE_COLORS[expense.category] || 'secondary';
    badge.className = `badge text-bg-${badgeColor}`;
    badge.textContent = expense.category;
    categoryCell.append(badge);
    row.append(categoryCell);

    row.append(makeCell(expense.date));

    const actions = document.createElement('td');
    actions.className = 'text-nowrap text-end';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline-primary me-2';
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${expense.title}`);
    editButton.addEventListener('click', () => openEdit(expense));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-outline-danger';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${expense.title}`);
    deleteButton.addEventListener('click', () => handleDelete(expense, deleteButton));

    actions.append(editButton, deleteButton);
    row.append(actions);
    elements.tableBody.append(row);
  }
}

function applyFilter() {
  const selected = elements.filter.value;
  const searchTitle = elements.search.value.trim().toLowerCase();
  const visible = expenses.filter((expense) => {
    const matchesCategory = selected === 'All' || selected === '' || expense.category === selected;
    const matchesTitle = expense.title.toLowerCase().includes(searchTitle);
    return matchesCategory && matchesTitle;
  });
  renderTable(visible);
}

async function refreshExpenses() {
  try {
    expenses = await getExpenses();
    renderSummary(expenses); // Summary always uses every server row.
    applyFilter();
    return true;
  } catch (error) {
    showAlert(error.message);
    return false;
  }
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Return a message for this field, or an empty string when it is valid.
function getFieldError(field) {
  const value = field.value.trim();
  if (field.name === 'title') {
    if (!value) return 'Title is required.';
    if (value.length > 100) return 'Title must be 100 characters or fewer.';
  } else if (field.name === 'amount') {
    const amount = Number(value);
    if (!value || !Number.isFinite(amount) || amount <= 0) return 'Enter an amount greater than 0.';
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Use at most 2 decimal places.';
    if (amount > 99999999.99) return 'Amount must be no more than 99,999,999.99.';
  } else if (field.name === 'category') {
    if (!CATEGORIES.includes(value)) return 'Choose a category.';
  } else if (field.name === 'date') {
    if (!isRealDate(value)) return 'Choose a valid date using the calendar.';
  }
  return '';
}

function setFieldError(field, message) {
  document.getElementById(`${field.id}Error`).textContent = message;
  field.classList.toggle('is-invalid', Boolean(message));
  if (message) {
    field.setAttribute('aria-invalid', 'true');
  } else {
    field.removeAttribute('aria-invalid');
  }
}

function clearFieldErrors(form) {
  for (const name of ['title', 'amount', 'category', 'date']) {
    setFieldError(form.elements[name], '');
  }
}

function expenseFromForm(form) {
  let firstInvalidField = null;
  // Check every field so all errors appear together after submitting.
  for (const name of ['title', 'amount', 'category', 'date']) {
    const field = form.elements[name];
    const message = getFieldError(field);
    setFieldError(field, message);
    if (message && !firstInvalidField) firstInvalidField = field;
  }
  if (firstInvalidField) {
    firstInvalidField.focus();
    return null;
  }
  return {
    title: form.elements.title.value.trim(),
    amount: Number(form.elements.amount.value),
    category: form.elements.category.value,
    date: form.elements.date.value,
  };
}

async function handleAdd(event) {
  event.preventDefault();
  if (expenseChangeInProgress) return;
  clearFormError(elements.addError);
  const data = expenseFromForm(elements.addForm);
  if (!data) return;

  expenseChangeInProgress = true;
  elements.addButton.disabled = true;
  try {
    const addedExpense = await addExpense(data);
    elements.addForm.reset();
    if (await refreshExpenses()) showAlert(`${addedExpense.title} add successfully`, 'success');
  } catch (error) {
    showFormError(elements.addError, error.message);
  } finally {
    expenseChangeInProgress = false;
    elements.addButton.disabled = false;
  }
}

function openEdit(expense) {
  if (expenseChangeInProgress) return;
  editingExpenseId = expense.id;
  clearFormError(elements.editError);
  clearFieldErrors(elements.editForm);
  elements.editForm.elements.title.value = expense.title;
  elements.editForm.elements.amount.value = expense.amount;
  elements.editForm.elements.category.value = expense.category;
  elements.editForm.elements.date.value = expense.date;
  updateDateDisplay(elements.editForm.elements.date);
  bootstrap.Modal.getOrCreateInstance(elements.editModal).show();
}

function closeEditModal() {
  const modal = bootstrap.Modal.getOrCreateInstance(elements.editModal);
  if (editModalShown) {
    modal.hide();
  } else {
    // Bootstrap ignores hide() until its opening animation has finished.
    elements.editModal.addEventListener('shown.bs.modal', () => modal.hide(), { once: true });
  }
}

async function handleEdit(event) {
  event.preventDefault();
  if (expenseChangeInProgress || editingExpenseId === null) return;
  clearFormError(elements.editError);
  const data = expenseFromForm(elements.editForm);
  if (!data) return;

  expenseChangeInProgress = true;
  elements.editButton.disabled = true;
  try {
    await updateExpense(editingExpenseId, data);
    closeEditModal();
    if (await refreshExpenses()) showAlert('Expense updated.', 'success');
  } catch (error) {
    showFormError(elements.editError, error.message);
  } finally {
    expenseChangeInProgress = false;
    elements.editButton.disabled = false;
  }
}

async function handleDelete(expense, button) {
  if (expenseChangeInProgress) return;
  if (!window.confirm(`Delete "${expense.title}"?`)) return;
  expenseChangeInProgress = true;
  button.disabled = true;
  try {
    await deleteExpense(expense.id);
    if (await refreshExpenses()) showAlert('Expense deleted.', 'success');
  } catch (error) {
    showAlert(error.message);
  } finally {
    expenseChangeInProgress = false;
    button.disabled = false;
  }
}

function updateDateDisplay(input) {
  const display = document.getElementById(`${input.id}Display`);
  if (input.value) {
    const [year, month, day] = input.value.split('-');
    display.textContent = `${month}/${day}/${year}`;
  } else {
    display.textContent = 'Please input date (MM/DD/YYYY)';
  }
  display.classList.toggle('is-placeholder', !input.value);
}

// Keep the native calendar available, but prevent typing or pasting a date.
function useCalendarOnly(input) {
  updateDateDisplay(input);
  for (const eventName of ['input', 'change']) {
    input.addEventListener(eventName, () => updateDateDisplay(input));
  }
  // The reset event runs before the browser restores the empty date value.
  input.form.addEventListener('reset', () => queueMicrotask(() => updateDateDisplay(input)));

  // Open the calendar when any part of the date field is clicked or tapped.
  input.addEventListener('click', () => {
    if (typeof input.showPicker === 'function') input.showPicker();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') return;
    event.preventDefault();
    if (event.key === 'Enter' && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  });
  for (const eventName of ['beforeinput', 'paste', 'drop']) {
    input.addEventListener(eventName, (event) => event.preventDefault());
  }
}

useCalendarOnly(elements.addForm.elements.date);
useCalendarOnly(elements.editForm.elements.date);

// Recheck a field while the user corrects an error already shown.
for (const form of [elements.addForm, elements.editForm]) {
  for (const eventName of ['input', 'change']) {
    form.addEventListener(eventName, (event) => {
      const field = event.target;
      if (field.classList.contains('is-invalid')) setFieldError(field, getFieldError(field));
    });
  }
  form.addEventListener('reset', () => clearFieldErrors(form));
}

elements.addForm.addEventListener('submit', handleAdd);
elements.editForm.addEventListener('submit', handleEdit);
elements.filter.addEventListener('change', applyFilter);
elements.search.addEventListener('input', applyFilter);
elements.editModal.addEventListener('show.bs.modal', () => { editModalShown = false; });
elements.editModal.addEventListener('shown.bs.modal', () => { editModalShown = true; });
elements.editModal.addEventListener('hidden.bs.modal', () => {
  editingExpenseId = null;
  editModalShown = false;
});
refreshExpenses();
