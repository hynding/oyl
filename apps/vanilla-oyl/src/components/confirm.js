/**
 * Inline two-step confirm. Replaces `mount`'s content with "[prompt] [Yes] [No]";
 * Yes calls `onYes`, No calls `restore` (which should re-render the mount's prior
 * content). Shared by every row that offers a destructive/state-changing action, so the
 * confirm markup + a11y is identical everywhere (group role, `data-act="confirm-yes"` /
 * `"confirm-no"`). Listeners are scoped to the host's `lifecycle` AbortSignal.
 *
 * Styling: produces `.confirm` (the group) with `.yes` / `.no` buttons — components that
 * use this already carry those classes in their stylesheet.
 *
 * @param {{ mount: HTMLElement, prompt: string, lifecycle: AbortSignal, onYes: () => void, restore: () => void }} opts
 */
export function inlineConfirm({ mount, prompt, lifecycle, onYes, restore }) {
  mount.replaceChildren()
  const group = document.createElement('span')
  group.className = 'confirm'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', prompt)

  const label = document.createElement('span')
  label.textContent = prompt

  const yes = document.createElement('button')
  yes.className = 'yes'
  yes.dataset.act = 'confirm-yes'
  yes.textContent = 'Yes'
  yes.addEventListener('click', () => onYes(), { signal: lifecycle })

  const no = document.createElement('button')
  no.className = 'no'
  no.dataset.act = 'confirm-no'
  no.textContent = 'No'
  no.addEventListener('click', () => restore(), { signal: lifecycle })

  group.append(label, yes, no)
  mount.append(group)
  no.focus()
}
