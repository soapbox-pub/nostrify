import DefaultTheme from 'vitepress/theme';
import NostrifyLayout from './NostrifyLayout.vue';
import './custom.css';
import 'virtual:group-icons.css';

export default {
  extends: DefaultTheme,
  Layout: NostrifyLayout,
};
