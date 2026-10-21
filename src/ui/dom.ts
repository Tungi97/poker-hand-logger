type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null;

/** Tiny element builder: h('button', { class: 'x', onClick }, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = null, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k === 'checked') (el as HTMLInputElement).checked = Boolean(v);
    else if (k === 'disabled') (el as HTMLButtonElement).disabled = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function toast(msg: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 1600);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs https; fall back to the old selection trick
    const ta = h('textarea', { readonly: true, class: 'offscreen' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseNum(v: string): number | undefined {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
