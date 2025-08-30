var db = wx.cloud.database()
const app = getApp();
Page({
  data: {
    name: '',
    phone: ''
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },
  onLogin() {
    const { name, phone } = this.data;

    if (!name || !phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' });
      return;
    }
    db.collection("people").where({
      name: name,
      phone: phone
    }).get({
      success: res => {
        if (res.data.length === 0) {
          wx.showToast({ title: '账号或密码错误', icon: 'none' });
        } else {
          const user = res.data[0];
          if (user) {
            if (user.role == 'student') {
              // 学生跳转 TabBar 页面
              wx.switchTab({ url: '/pages/studentHome/studentHome' });
            } else if (user.role == 'admin') {
              // 管理员跳转普通页面
              wx.redirectTo({ url: '/pages/adminHome/adminHome' });
            } else {
              wx.showToast({ title: '身份异常，请联系管理员', icon: 'none' });
            }
          } else {
            wx.showToast({ title: '用户信息获取失败', icon: 'none' });
          }
        }
      }
    })
  }
})