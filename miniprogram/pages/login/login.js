var db = wx.cloud.database();

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
  visitorLogin() {
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
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const openid = res.result.openid;
        // 1. 检查当前 openid 是否已经注册
        db.collection('people').where({ _openid: openid }).get({
          success: res2 => {
            if (res2.data.length > 0) {
              // 已注册，根据角色跳转
              const user = res2.data[0];
              if (user.role === 'admin') {
                wx.redirectTo({ url: '/pages/adminHome/adminHome' });
              } else if (user.role === 'student') {
                wx.switchTab({ url: '/pages/studentHome/studentHome' });
              } else {
                wx.showToast({ title: '身份异常，请联系管理员', icon: 'none' });
              }
            } else {
              // 2. 没有注册，判断系统是否已有管理员
              db.collection("people").where({
                role: "admin"
              }).get({
                success: adminRes => {
                  if (adminRes.data.length === 0) {
                    // 没有管理员，当前第一个注册，自动成为管理员
                    db.collection("people").add({
                      data: {
                        name: name,
                        phone: phone,
                        role: 'admin',
                        _openid: openid
                      },
                      success: () => {
                        wx.showToast({ title: '已注册为管理员', icon: 'success' });
                        wx.redirectTo({ url: '/pages/adminHome/adminHome' });
                      },
                      fail: () => {
                        wx.showToast({ title: '管理员注册失败', icon: 'none' });
                      }
                    });
                  } else {
                    // 已有管理员，自动注册为学生
                    db.collection("people").add({
                      data: {
                        name: name,
                        phone: phone,
                        role: 'student',
                        _openid: openid,
                        cards: []
                      },
                      success: () => {
                        wx.showToast({ title: '注册成功', icon: 'success' });
                        wx.switchTab({ url: '/pages/studentHome/studentHome' });
                      },
                      fail: () => {
                        wx.showToast({ title: '注册失败', icon: 'none' });
                      }
                    });
                  }
                },
                fail: () => {
                  wx.showToast({ title: '系统检测管理员失败', icon: 'none' });
                }
              });
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