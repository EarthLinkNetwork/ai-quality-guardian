---
name: list-component-standards
description: Standards for all list/table UI components. Apply when creating any list view with items that need filtering, searching, or pagination.
user-invocable: false
---

# List Component Standards

When creating ANY list/table view in the Web UI:

## Required Controls
1. **Page size selector**: 10/25/50 items per page
2. **Status filter**: Active (default) / All / Completed / Paused / On Hold
3. **Text search**: Filter by name, path, ID (triggered on Enter key)
4. **Pagination**: Showing X-Y of Z, Prev/Next buttons
5. **Default filter**: Show only active items (exclude archived and completed)

## CSS Pattern
- Use flex layout with gap:8px for controls bar
- Use existing `.btn.btn-sm` for pagination buttons
- Use consistent select/input styling: `background:#fff; color:#333; border:1px solid #d1d5db; border-radius:4px;`
- Font size for controls: 0.8rem-0.85rem
- Wrap controls with `flex-wrap:wrap` for responsive layout

## State Variables Pattern
Each list needs its own set of state variables with a unique prefix:

```javascript
var dashProjectPage = 1;
var dashProjectPageSize = 10;
var dashProjectSearch = '';
var dashProjectStatus = 'active';
```

Name pattern: `{prefix}Page`, `{prefix}PageSize`, `{prefix}Search`, `{prefix}Status`

## Filter Logic Pattern
```javascript
var filtered = items;
if (listSearch) {
  var q = listSearch.toLowerCase();
  filtered = filtered.filter(function(item) {
    return (item.name || '').toLowerCase().includes(q) ||
           (item.path || '').toLowerCase().includes(q) ||
           (item.id || '').toLowerCase().includes(q);
  });
}
if (listStatus !== 'all') {
  filtered = filtered.filter(function(item) {
    return (item.status || 'active') === listStatus;
  });
}
var startIdx = (listPage - 1) * listPageSize;
var endIdx = startIdx + listPageSize;
var paged = filtered.slice(startIdx, endIdx);

// Clamp page if out of range
if (startIdx >= filtered.length && filtered.length > 0) {
  listPage = Math.max(1, Math.ceil(filtered.length / listPageSize));
  startIdx = (listPage - 1) * listPageSize;
  endIdx = startIdx + listPageSize;
  paged = filtered.slice(startIdx, endIdx);
}
```

## Controls HTML Pattern
```javascript
var controlsHtml = '<div style="display:flex; gap:8px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">' +
  // Page size selector
  '<select onchange="listPageSize=parseInt(this.value); listPage=1; render();" style="padding:4px 8px; background:#fff; color:#333; border:1px solid #d1d5db; border-radius:4px; font-size:0.8rem;">' +
    '<option value="10">10</option>' +
    '<option value="25">25</option>' +
    '<option value="50">50</option>' +
  '</select>' +
  // Status filter
  '<select onchange="listStatus=this.value; listPage=1; render();" style="...">' +
    '<option value="active">Active</option>' +
    '<option value="all">All</option>' +
    '<option value="completed">Completed</option>' +
  '</select>' +
  // Search input (triggers on Enter)
  '<input type="text" placeholder="Search..." value="..." ' +
    'oninput="listSearch=this.value;" ' +
    'onkeydown="if(event.key===\'Enter\'){listPage=1;render();}" ' +
    'style="flex:1; min-width:120px; padding:4px 8px; ...">' +
  // Pagination info
  '<span style="font-size:0.8rem; color:#9ca3af;">1-10 of 42</span>' +
  // Prev/Next buttons
  '<button class="btn btn-sm" onclick="listPage=Math.max(1,listPage-1);render();">Prev</button>' +
  '<button class="btn btn-sm" onclick="listPage++;render();">Next</button>' +
'</div>';
```

## Empty State Pattern
Show different messages for "no items match filters" vs "no items exist":

```javascript
var content = paged.length > 0
  ? paged.map(renderItem).join('')
  : (filtered.length === 0 && items.length > 0
      ? '<div class="empty-state"><p>No items match your filters.</p></div>'
      : '<div class="empty-state"><p>No items yet.</p></div>');
```

## Reference Implementation
See `renderDashboard()` in `src/web/public/index.html` for the first implementation of this pattern (Dashboard projects list).
