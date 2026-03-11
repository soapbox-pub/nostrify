import DefaultTheme from 'vitepress/theme';
import NostrifyLayout from './NostrifyLayout.vue';
import './custom.css';
import 'virtual:group-icons.css';

export default {
  extends: DefaultTheme,
  Layout: NostrifyLayout,
  enhanceApp({ app, router }) {
    if (typeof window !== 'undefined' && import.meta.env.VITE_PLAUSIBLE_DOMAIN) {
      import('@plausible-analytics/tracker').then(({ init }) => {
        init({
          domain: import.meta.env.VITE_PLAUSIBLE_DOMAIN,
          ...(import.meta.env.VITE_PLAUSIBLE_ENDPOINT ? { endpoint: import.meta.env.VITE_PLAUSIBLE_ENDPOINT } : {}),
        });
      });
    }
  },
};
