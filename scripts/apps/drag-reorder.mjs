// Private MIME type: text inputs don't accept it, so dropping a row over an
// <input> never pastes anything into the field.
const DRAG_TYPE = 'application/x-dh-lang-reorder';

/**
 * Wires mouse drag-to-reorder on the rows of one list.
 *
 * - Only a row's handle starts a drag (the handle must carry `draggable="true"`),
 *   so clicking and selecting text in the row's inputs works normally.
 * - Rows only move within `container`; a row dragged from another list is ignored.
 * - While dragging, the row itself moves to the prospective drop position (the
 *   other rows shift around it) and carries the `.is-dragging` class, which styles
 *   it as the insertion marker. A cancelled drag restores the original position.
 * - On drop, `onReorder` receives the row ids (from `data-row-id`) in their new order.
 *
 * @param {HTMLElement} container
 * @param {{ rowSelector: string, handleSelector: string, onReorder: (ids: string[]) => void }} options
 */
export function enableDragReorder(container, { rowSelector, handleSelector, onReorder }) {
  if (!container) return;

  let dragged = null;
  let originalNext = null;
  let dropped = false;

  const rows = () => [...container.querySelectorAll(rowSelector)];

  for (const handle of container.querySelectorAll(handleSelector)) {
    handle.addEventListener('dragstart', e => {
      const row = handle.closest(rowSelector);
      if (!row) return;
      dragged = row;
      originalNext = row.nextSibling;
      dropped = false;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(DRAG_TYPE, row.dataset.rowId ?? '');
      // Show the whole row as the drag image, grabbed where the handle is.
      const rowRect = row.getBoundingClientRect();
      e.dataTransfer.setDragImage(row, e.clientX - rowRect.left, e.clientY - rowRect.top);
      // Defer the class: changing the row synchronously in dragstart can abort the drag in Chrome.
      requestAnimationFrame(() => dragged?.classList.add('is-dragging'));
    });

    handle.addEventListener('dragend', () => {
      if (!dragged) return;
      dragged.classList.remove('is-dragging');
      if (!dropped) dragged.parentNode?.insertBefore(dragged, originalNext);
      dragged = null;
    });
  }

  container.addEventListener('dragover', e => {
    if (!dragged) return; // not a drag from this list — leave the drop disallowed
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = e.target.closest?.(rowSelector);
    if (!target || target === dragged || !container.contains(target)) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const anchor = before ? target : target.nextSibling;
    if (anchor !== dragged && dragged.nextSibling !== anchor) {
      target.parentNode.insertBefore(dragged, anchor);
    }
  });

  container.addEventListener('drop', e => {
    if (!dragged) return;
    e.preventDefault();
    dropped = true;
    onReorder(rows().map(r => r.dataset.rowId));
  });
}
