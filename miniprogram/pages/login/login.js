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
    console.log('name: '+name);
    console.log('phone: '+phone);//以上两行是日志，可删
    if (!name || !phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' })
      return
    }

    wx.cloud.callFunction({
      name: 'login',
      data: { name, phone },
      success: res => {
        console.log('Successfully running cloud func login in page/login/login.js, line 30.\n returing data is:');
        console.log(res.result.role);
        console.log('log infomattion is:');
        console.log(res.result.LogInfo);// 以上四行console.log是日志，可删
        const role = res.result.role
        if (role === 'admin') {
          wx.redirectTo({ url: '/pages/adminHome/adminHome' })
        } else if (role === 'student') {
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
