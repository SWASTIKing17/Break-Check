document.addEventListener('DOMContentLoaded', () => {
  const btnAddUser = document.getElementById('btn-db-add-user');
  const tableUsersBody = document.querySelector('#table-users tbody');

  async function loadUsers() {
    if (!tableUsersBody) return;
    try {
      const users = await window.api.db.getUsers();
      tableUsersBody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${u.name}</td>
          <td>${u.initials}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:14px;height:14px;border-radius:50%;background:${u.hex_color};"></div>
              ${u.hex_color}
            </div>
          </td>
          <td>
            <button class="btn-icon btn-delete" data-id="${u.id}" title="Delete" style="background:transparent;border:none;cursor:pointer;">🗑</button>
          </td>
        `;
        tableUsersBody.appendChild(tr);
      });

      tableUsersBody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = parseInt(e.currentTarget.dataset.id);
          if (confirm('Delete this user?')) {
            await window.api.db.deleteUser(id);
            loadUsers();
          }
        });
      });
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  if (btnAddUser) {
    btnAddUser.addEventListener('click', async () => {
      const name = prompt("Enter employee's full name (e.g. 'Swastik Bunker'):");
      if (!name || !name.trim()) return;

      const parts = name.trim().split(/\s+/);
      let initials = '??';
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts.length === 1 && parts[0].length >= 2) {
        initials = parts[0].substring(0, 2).toUpperCase();
      } else if (parts.length === 1 && parts[0].length === 1) {
        initials = (parts[0][0] + parts[0][0]).toUpperCase();
      }

      const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e"];
      const hex = colors[Math.floor(Math.random() * colors.length)];

      try {
        await window.api.db.addUser(name.trim(), initials, hex);
        loadUsers();
      } catch (err) {
        alert("Failed to add user (might be a duplicate name).");
      }
    });
  }

  // Load initially
  loadUsers();
});
