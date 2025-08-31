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
  visitorLogin(){
    wx.navigateTo({
      url: '/pages/youke/youke'
    });
  },
  onLogin() {
    const { name, phone } = this.data;

    if (!name || !phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' });
      return;
    }

    // 先获取 openid
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const openid = res.result.openid;
        // 查找数据库是否有录入该用户信息
        db.collection("people").where({
          name: name,
          phone: phone
        }).get({
          success: dbRes => {
            if (dbRes.data.length === 0) {
              wx.showToast({ title: '账号或密码错误', icon: 'none' });
            } else {
              const user = dbRes.data[0];
              // 检查 openid 是否绑定
              // 注意：云开发自动有字段 _openid，如果你之前用 openid 字段也可以用 openid
              // 推荐用 _openid 统一管理
              if (!user._openid || user._openid === "" || user._openid === undefined) {
                // 补全 openid 字段（自动绑定微信身份）
                db.collection("people").doc(user._id).update({
                  data: { _openid: openid },
                  success: () => {
                    wx.showToast({ title: '已绑定微信身份' });
                    // 跳转页面
                    if (user.role == 'student') {
                      wx.switchTab({ url: '/pages/studentHome/studentHome' });
                    } else if (user.role == 'admin') {
                      wx.redirectTo({ url: '/pages/adminHome/adminHome' });
                    } else {
                      wx.showToast({ title: '身份异常，请联系管理员', icon: 'none' });
                    }
                  }
                });
              } else {
                // 已绑定无需处理，直接跳转
                if (user.role == 'student') {
                  wx.switchTab({ url: '/pages/studentHome/studentHome' });
                } else if (user.role == 'admin') {
                  wx.redirectTo({ url: '/pages/adminHome/adminHome' });
                } else {
                  wx.showToast({ title: '身份异常，请联系管理员', icon: 'none' });
                }
              }
            }
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '获取微信身份失败', icon: 'none' });
      }
    });
  }
})