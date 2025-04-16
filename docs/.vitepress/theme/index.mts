import DefaultTheme from 'vitepress/theme';
import NostrifyLayout from './NostrifyLayout.vue'
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: NostrifyLayout,
}