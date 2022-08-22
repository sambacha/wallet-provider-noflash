# wallet-provider-noflash

```javascript
import { useEffect, useLayoutEffect } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default useIsomorphicLayoutEffect;
```
`

Web components are registered with JavaScript, so depending on how and when you load Shoelace, you may notice a Flash of Undefined Custom Elements (FOUCE) when the page loads. There are a couple ways to prevent this, both of which are described in the linked article.

One option is to use the :defined CSS pseudo-class to "hide" custom elements that haven't been registered yet. You can scope it to specific tags or you can hide all undefined custom elements as shown below.

```css
:not(:defined) {
  visibility: hidden;
}
```
As soon as a custom element is registered, it will immediately appear with all of its styles, effectively eliminating FOUCE. Note the use of visibility: hidden instead of display: none to reduce shifting as elements are registered. The drawback to this approach is that custom elements can potentially appear one by one instead of all at the same time.

Another option is to use customElements.whenDefined(), which returns a promise that resolves when the specified element gets registered. You'll probably want to use it with Promise.allSettled() in case an element fails to load for some reason.

A clever way to use this method is to hide the <body> with opacity: 0 and add a class that fades it in as soon as all your custom elements are defined.

```javascript
<style>
  body {
    opacity: 0;
  }

  body.ready {
    opacity: 1;
    transition: 0.25s opacity;
  }
</style>

<script type="module">
  await Promise.allSettled([
    customElements.whenDefined('sl-button'),
    customElements.whenDefined('sl-card'),
    customElements.whenDefined('sl-rating')
  ]);

  // Button, card, and rating are registered now! Add
  // the `ready` class so the UI fades in.
  document.body.classList.add('ready');
</script>
```
