export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/chat/index',
    'pages/stats/index',
    'pages/profile/index',
    'pages/device-manager/index',
    'pages/device-add/index',
    'pages/personal-info/index',
    'pages/family/index',
    'pages/family-edit/index',
    'pages/recipe/index',
    'pages/reminder-settings/index',
    'pages/login/index',
    'pages/agreement/index',
    'pages/privacy/index',
  ],
  lazyCodeLoading: 'requiredComponents',
  __usePrivacyCheck__: true,
  tabBar: {
    color: '#6b7280',
    selectedColor: '#2d6a3f',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: './assets/icons/home_unselected.png',
        selectedIconPath: './assets/icons/home_selected.png'
      },
      {
        pagePath: 'pages/chat/index',
        text: 'AI问答',
        iconPath: './assets/icons/chat_unselected.png',
        selectedIconPath: './assets/icons/chat_selected.png'
      },
      {
        pagePath: 'pages/stats/index',
        text: '统计',
        iconPath: './assets/icons/stats_unselected.png',
        selectedIconPath: './assets/icons/stats_selected.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: './assets/icons/profile_unselected.png',
        selectedIconPath: './assets/icons/profile_selected.png'
      }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#2d6a3f',
    navigationBarTitleText: '智能健康助手',
    navigationBarTextStyle: 'white'
  }
})
