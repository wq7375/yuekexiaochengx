const db = wx.cloud.database();

Page({
  data: {
    date: ""
  },
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },
  onSubmit(e) {
    const { name, mobile, remark } = e.detail.value;
    const date = this.data.date;
    if (!name || !mobile || !date) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    db.collection('trialLessons').add({
      data: {
        name, mobile, date, remark, submitTime: new Date()
      },
      success: () => {
        wx.showToast({ title: '报名成功！', icon: 'success' });
        
        // 订阅消息提醒管理端（建议放在 success 里）
        wx.cloud.callFunction({
          name: 'sendTrialNotify',
          data: { name, mobile, date, remark },
          success: () => {},
          fail: () => {}
        });
        wx.requestSubscribeMessage({
          tmplIds: ['模板id'], // 替换为你的订阅消息模板id
          success: () => {},
          fail: () => {}
        });
        // 建议延迟跳转或清空表单
        setTimeout(() => {
          // wx.navigateBack(); // 或 wx.redirectTo({ url: '/pages/index/index' })
          // 或清空表单
          this.setData({ date: '', name: '', mobile: '', remark: '' });
        }, 1500);
      },
      fail: () => {
        wx.showToast({ title: '报名失败，请重试', icon: 'none' });
      }
    });
  }
});