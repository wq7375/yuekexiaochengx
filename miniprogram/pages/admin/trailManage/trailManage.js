// pages/admin/trailManage/trailManage.js
const db = wx.cloud.database();
function formatTime(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
}
Page({
  data: {
    trialList: []
  },
  onLoad() {
    this.getTrials();
  },
  getTrials() {
    db.collection('trialLessons').orderBy('submitTime', 'desc').get({
      success: res => {
        this.setData({ trialList: res.data });
      }
    });
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该报名信息吗？',
      success: res => {
        if (res.confirm) {
          db.collection('trialLessons').doc(id).remove({
            success: () => {
              wx.showToast({ title: '已删除' });
              this.getTrials();
            }
          });
        }
      }
    });
  }
});