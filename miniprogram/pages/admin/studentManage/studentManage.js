const db = wx.cloud.database();

const cardTypes = [
  { category: 'group', type: 'month', label: '团课月卡' },
  { category: 'group', type: 'season', label: '团课季卡' },
  { category: 'group', type: 'half', label: '团课半年卡' },
  { category: 'group', type: 'year', label: '团课年卡' },
  { category: 'group', type: 'count', label: '团课次卡' },
  { category: 'private', type: 'private', label: '私教卡' }
];

Page({
  data: {
    peopleList: [],
    name: '',
    phone: '',
    role: 'student',
    editingId: null,
    cardTypes,
    // 卡编辑区
    newCardTypeIndex: 0, // picker选中索引
    newCardExpireDate: '',
    newCardRemainCount: null,
    cards: [], // 当前学员的所有卡
    selectedCardLabel: cardTypes[0].label // 当前picker选中的卡类型label
  },
  onLoad() {
    this.getPeopleList();
  },
  getPeopleList() {
    db.collection('people').get({
      success: res => {
        this.setData({ peopleList: res.data });
      }
    })
  },
  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onRoleChange(e) {
    const role = ['student', 'admin'][e.detail.value];
    this.setData({ role });
  },
  onCardTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      newCardTypeIndex: idx,
      selectedCardLabel: cardTypes[idx].label
    });
  },
  onExpireDateInput(e) { this.setData({ newCardExpireDate: e.detail.value }); },
  onRemainCountInput(e) { this.setData({ newCardRemainCount: Number(e.detail.value) }); },

  // 添加卡
  onAddCard() {
    const idx = this.data.newCardTypeIndex;
    const typeObj = cardTypes[idx];
    let cardObj = {
      category: typeObj.category,
      type: typeObj.type,
      label: typeObj.label
    };
    if (typeObj.type === 'count' || typeObj.type === 'private') {
      cardObj.remainCount = this.data.newCardRemainCount || 0;
    } else {
      cardObj.expireDate = this.data.newCardExpireDate;
    }
    this.setData({
      cards: [...this.data.cards, cardObj],
      // 重置输入
      newCardTypeIndex: 0,
      selectedCardLabel: cardTypes[0].label,
      newCardExpireDate: '',
      newCardRemainCount: null
    });
  },
  // 删除卡
  onDeleteCard(e) {
    const idx = e.currentTarget.dataset.index;
    let cards = this.data.cards.slice();
    cards.splice(idx, 1);
    this.setData({ cards });
  },
  // 编辑学员/管理员
  onEdit(e) {
    const { id, name, phone, role, cards } = e.currentTarget.dataset;
    this.setData({
      editingId: id,
      name, phone, role,
      cards: cards || []
    });
  },
  // 删除学员/管理员
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    db.collection('people').doc(id).remove({
      success: () => {
        wx.showToast({ title: '删除成功' });
        this.getPeopleList();
      }
    });
  },
  // 新增或更新学员/管理员
  onSubmit() {
    const { name, phone, role, cards, editingId } = this.data;
    if (!name || !phone || !role) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    let userData = { name, phone, role };
    if (role === 'student') {
      userData.cards = cards;
      // 新增时不填openid，等学生首次登录时自动补全
    }
    if (editingId) {
      db.collection('people').doc(editingId).update({
        data: userData,
        success: () => {
          wx.showToast({ title: '更新成功' });
          this.setData({
            editingId: null, name: '', phone: '', role: 'student', cards: []
          });
          this.getPeopleList();
        }
      });
    } else {
      db.collection('people').add({
        data: userData,
        success: () => {
          wx.showToast({ title: '添加成功' });
          this.setData({
            name: '', phone: '', role: 'student', cards: []
          });
          this.getPeopleList();
        }
      });
    }
  }
});