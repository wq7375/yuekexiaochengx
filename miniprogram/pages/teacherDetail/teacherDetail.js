// pages/teacherDetail/teacherDetail.js
const db = wx.cloud.database();
Page({
  data: {
    teacher: {}
  },
  onLoad(options) {
    let id = options.id;
    db.collection('teachers').doc(id).get({
      success: res => {
        this.setData({ teacher: res.data });
      }
    });
  }
});