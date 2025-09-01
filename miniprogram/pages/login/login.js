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

    // 获取 openid
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const openid = res.result.openid;
        // 先检查系统是否已经有管理员
        db.collection("people").where({
          role: "admin"
        }).get({
          success: adminRes => {
            if (adminRes.data.length === 0) {
              // 没有管理员，自动注册为管理员
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
              // 已有管理员，按正常流程登录
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
                    if (!user._openid || user._openid === "" || user._openid === undefined) {
                      db.collection("people").doc(user._id).update({
                        data: { _openid: openid },
                        success: () => {
                          wx.showToast({ title: '已绑定微信身份' });
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
            }
          },
          fail: () => {
            wx.showToast({ title: '系统检测管理员失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '获取微信身份失败', icon: 'none' });
      }
    });
  }
})