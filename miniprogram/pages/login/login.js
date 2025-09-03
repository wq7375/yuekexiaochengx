Page({
  data: {
    name: '',
    phone: ''
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },
  visitorLogin() {
    wx.navigateTo({
      url: '/pages/youke/youke'
    });
  },

  onLogin() {
    const { name, phone } = this.data
    // console.log('name: '+name);
    // console.log('phone: '+phone);//以上两行是日志，可删
    if (!name || !phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' })
      return
    }

    wx.cloud.callFunction({
      name: 'login',
      data: { name, phone },
      success: res => {
        const { role, id } = res.result
        // console.log(res.result.LogInfo);//日志，可删
        if (role === 'admin') {
          wx.setStorageSync('userId', id)
          wx.redirectTo({ url: '/pages/adminHome/adminHome' })
        } else if (role === 'student') {
          wx.setStorageSync('userId', id)
          wx.switchTab({ url: '/pages/studentHome/studentHome' })
        } else {
          wx.showToast({ title: '未找到信息，请联系管理员', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  }
})
