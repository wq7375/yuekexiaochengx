// pages/teacherDetail/teacherDetail.js
const db = wx.cloud.database();

Page({
  data: { teacher: {} },
  onLoad(options) {
    db.collection('teachers').doc(options.id).get({
      success: res => {
        this.setData({ teacher: res.data });
      }
    });
  }
});