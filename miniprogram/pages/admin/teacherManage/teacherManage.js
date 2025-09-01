// pages/admin/teacherManage/teacherManage.js
const db = wx.cloud.database();

Page({
  data: {
    teacherList: [],
    form: {
      avatar: '',
      name: '',
      intro: '',
      skillsStr: '',
      skills: [],
      video: '',
      editId: null
    }
  },
  onLoad() {
    this.getTeachers();
  },
  getTeachers() {
    db.collection('teachers').orderBy('createTime','desc').get({
      success: res => {
        this.setData({ teacherList: res.data });
      }
    });
  },
  onUploadAvatar() {
    wx.chooseImage({
      count: 1,
      success: res => {
        const filePath = res.tempFilePaths[0];
        const cloudPath = "teachers/" + Date.now() + "_" + Math.floor(Math.random()*1000) + ".jpg";
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            this.setData({ 'form.avatar': uploadRes.fileID });
          }
        });
      }
    });
  },
  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },
  onIntroInput(e) {
    this.setData({ 'form.intro': e.detail.value });
  },
  onSkillsInput(e) {
    this.setData({ 'form.skillsStr': e.detail.value });
  },
  onUploadVideo() {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 60,
      success: res => {
        const filePath = res.tempFilePath;
        const cloudPath = "teachers/video_" + Date.now() + "_" + Math.floor(Math.random()*1000) + ".mp4";
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            this.setData({ 'form.video': uploadRes.fileID });
          }
        });
      }
    });
  },
  onDeleteVideo() {
    this.setData({ 'form.video': '' });
  },
  onSubmit() {
    let { avatar, name, intro, skillsStr, video, editId } = this.data.form;
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' }); return;
    }
    let skills = skillsStr.split(/[，,]/).map(s=>s.trim()).filter(Boolean);
    let data = { avatar, name, intro, skills, video, createTime: new Date() };
    if (editId) {
      db.collection('teachers').doc(editId).update({
        data,
        success: () => {
          wx.showToast({ title: '更新成功' });
          this.setData({ form: { avatar:'',name:'',intro:'',skillsStr:'',skills:[],video:'',editId:null } });
          this.getTeachers();
        }
      });
    } else {
      db.collection('teachers').add({
        data,
        success: () => {
          wx.showToast({ title: '添加成功' });
          this.setData({ form: { avatar:'',name:'',intro:'',skillsStr:'',skills:[],video:'',editId:null } });
          this.getTeachers();
        }
      });
    }
  },
  onEditTeacher(e) {
    const id = e.currentTarget.dataset.id;
    let teacher = this.data.teacherList.find(t => t._id === id);
    this.setData({
      form: {
        avatar: teacher.avatar,
        name: teacher.name,
        intro: teacher.intro,
        skillsStr: teacher.skills.join(','),
        skills: teacher.skills,
        video: teacher.video || '',
        editId: teacher._id
      }
    });
  },
  onDeleteTeacher(e) {
    const id = e.currentTarget.dataset.id;
    db.collection('teachers').doc(id).remove({
      success: () => {
        wx.showToast({ title: '已删除' });
        this.getTeachers();
      }
    });
  }
});