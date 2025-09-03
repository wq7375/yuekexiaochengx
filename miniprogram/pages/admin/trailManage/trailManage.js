// pages/admin/trailManage/trailManage.js
const db = wx.cloud.database();

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    trialList: []
  },

  onLoad() {
    this.getTrials();
  },

  getTrials() {
    wx.showLoading({ title: '加载中...' });
    db.collection('trialLessons').get({
      success: res => {
        const list = res.data
          .map(item => ({
            ...item,
            formattedTime: formatTime(item.submitTime)
          }))
          .sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime)); // 手动排序
        this.setData({ trialList: list });
      },
      fail: err => {
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.error('获取 trialLessons 失败：', err);
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: 'ID无效', icon: 'none' });
      return;
    }
  
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该报名信息吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deleteTrialLesson',
            data: { id },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({ title: '已删除' });
                this.getTrials();
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
                console.error('云函数错误:', res.result.error);
              }
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '调用失败', icon: 'none' });
              console.error('云函数调用失败:', err);
            }
          });
        }
      }
    });
  }
  
});
  