import { PropertySymbol, Window } from 'happy-dom';

export function polyfillDOM(): void {
  const window = new Window();
  const document = window.document;
  const browserWindow = document[PropertySymbol.window];

  const setInnerHTML = (html: string) => document.documentElement.innerHTML = html;
  const cancelAsync = () => window.happyDOM.abort();

  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: browserWindow.HTMLElement,
    Element: browserWindow.Element,
    Node: browserWindow.Node,
    navigator: browserWindow.navigator,
    DocumentFragment: browserWindow.DocumentFragment,
    DocumentType: browserWindow.DocumentType,
    SVGElement: browserWindow.SVGElement,
    Text: browserWindow.Text,
    requestAnimationFrame: browserWindow.requestAnimationFrame,
    cancelAnimationFrame: browserWindow.cancelAnimationFrame,
    setTimeout: browserWindow.setTimeout,
    clearTimeout: browserWindow.clearTimeout,
    setInterval: browserWindow.setInterval,
    clearInterval: browserWindow.clearInterval,
    queueMicrotask: browserWindow.queueMicrotask,
    AbortController: browserWindow.AbortController,
    cancelAsync,
    setInnerHTML,
  });
}
