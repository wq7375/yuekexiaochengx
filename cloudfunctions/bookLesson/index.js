// 云函数 bookLesson/index.js
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { openid, cardType, lessonDate } = event
  // 获取学生卡片
  const peopleRes = await db.collection('people').where({ _openid: openid, role: 'student' }).get()
  if (!peopleRes.data.length) return { success: false, msg: '学生不存在' }
  const person = peopleRes.data[0]
  let changed = false
  let newCards = person.cards.map(card => {
    if (card.type === cardType || card.category === cardType) {
      // 次卡扣次数
      if (card.remainCount > 0) {
        card.remainCount -= 1
        changed = true
      }
      // 月卡/所有卡自动扣天数可加 expireDate 判断
      // 如需按约课日期自动递减 expireDate，可补充逻辑
    }
    return card
  })
  if (changed) {
    await db.collection('people').doc(person._id).update({
      data: { cards: newCards }
    })
  }
  return { success: true }
}