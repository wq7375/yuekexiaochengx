const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId, scheduleId, action, cardLabel, isForce } = event
  // ⚠️ cardLabel 必须为前端 picker 选择到的卡片 label（如“私教卡”、“团课月卡”）

  // 1. 获取用户（people）信息
  const userRes = await db.collection('people').doc(studentId).get()
  const user = userRes.data
  if (!user) return { success: false, msg: '用户不存在' }

  // 2. 找该学生的目标卡
  const card = (user.cards || []).find(c => c.label === cardLabel)
  if (!card) return { success: false, msg: '未找到对应卡片' }

  // 3. 检查卡的次数和有效期（isForce 为 true 时跳过）
  if (action === "reserve") {
    if (!isForce) {
      // 次卡/私教卡类型，需判断次数
      if ((card.type === "private" || card.type === "count") && (card.remainCount === undefined || card.remainCount <= 0)) {
        return { success: false, msg: '卡次数不足' }
      }
      if (card.expireDate && new Date(card.expireDate) < new Date()) {
        return { success: false, msg: '卡已过期' }
      }
    }

    // 4. 扣次数并写入booking
    // 注意：需原子更新 cards 数组
    if (card.type === "private" || card.type === "count") {
      const cardIdx = user.cards.findIndex(c => c.label === cardLabel)
      if (cardIdx === -1) return { success: false, msg: '未找到卡' }
      await db.collection('people').doc(studentId).update({
        [`cards.${cardIdx}.remainCount`]: db.command.inc(-1)
      })
    }
    await db.collection('booking').add({
      data: {
        studentId,
        scheduleId,
        cardLabel,
        createTime: db.serverDate(),
        status: 1 // 已预约
      }
    })
    return { success: true }
  } else if (action === "cancel") {
    // 取消预约返还次数
    if (card.type === "private" || card.type === "count") {
      const cardIdx = user.cards.findIndex(c => c.label === cardLabel)
      if (cardIdx === -1) return { success: false, msg: '未找到卡' }
      await db.collection('people').doc(studentId).update({
        [`cards.${cardIdx}.remainCount`]: db.command.inc(1)
      })
    }
    await db.collection('booking').where({ studentId, scheduleId, cardLabel }).remove()
    return { success: true }
  }
}