// pages/studentHome/studentHome.js
Page({
  data: {
    banners: [
      '/images/banner/banner1.jpg',
      '/images/banner/banner2.jpg',
      '/images/banner/banner3.jpg',
    ],
    teachers: [
      { name: '鳐鳐老师', image: '/images/teacher1.jpg' },
      { name: '钟庆老师', image: '/images/teacher2.jpg' },
      { name: '梦梦老师', image: '/images/teacher1.jpg' }
    ]
  },
  onLoad: function (options) { }, 
  goToExperience() {
    wx.navigateTo({
      url: '/pages/experience/experience'
    })
  },
  goToyueke() {
    wx.switchTab({
      url: '/pages/yueke/yueke'
    })
  },
  goToyaoyao() {
    wx.navigateTo({
      url: '/pages/yaoyao/yaoyao'
    })
  },
  
  
})

