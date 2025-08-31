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
    db.collection('teachers').get({
      success: res => {
        this.setData({ teacherList: res.data });
      }
    });
  },
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      success: res => {
        wx.cloud.uploadFile({
          cloudPath: 'teacher_avatar/' + Date.now() + '.jpg',
          filePath: res.tempFilePaths[0],
          success: upRes => {
            this.setData({ 'form.avatar': upRes.fileID });
          }
        });
      }
    });
  },
  chooseVideo() {
    wx.chooseVideo({
      count: 1,
      success: res => {
        wx.cloud.uploadFile({
          cloudPath: 'teacher_video/' + Date.now() + '.mp4',
          filePath: res.tempFilePaths[0],
          success: upRes => {
            this.setData({ 'form.video': upRes.fileID });
          }
        });
      }
    });
  },
  onNameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  onIntroInput(e) { this.setData({ 'form.intro': e.detail.value }); },
  onSkillsInput(e) { this.setData({ 'form.skillsStr': e.detail.value }); },
  onSubmit() {
    let { avatar, name, intro, skillsStr, video, editId } = this.data.form;
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' }); return;
    }
    let skills = skillsStr.split(/[，,]/).map(s=>s.trim()).filter(Boolean);
    let data = { avatar, name, intro, skills, video };
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
      data.createTime = new Date();
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
  onEdit(e) {
    let id = e.currentTarget.dataset.id;
    let teacher = this.data.teacherList.find(t=>t._id==id);
    this.setData({
      form: {
        avatar: teacher.avatar,
        name: teacher.name,
        intro: teacher.intro,
        skillsStr: teacher.skills.join('，'),
        skills: teacher.skills,
        video: teacher.video,
        editId: id
      }
    });
  },
  onDelete(e) {
    let id = e.currentTarget.dataset.id;
    db.collection('teachers').doc(id).remove({
      success: () => {
        wx.showToast({ title: '已删除' });
        this.getTeachers();
      }
    });
  }
});