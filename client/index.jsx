export { default as VideoDownloadPage } from './pages/VideoDownloadPage';

export const routes = [
  { path: '', component: 'VideoDownloadPage', title: 'Video Download' }
];

export const defaultNav = {
  section: null,
  title: 'Video Download',
  icon: 'download'
};

export const componentMap = {
  VideoDownloadPage: () => import('./pages/VideoDownloadPage')
};
