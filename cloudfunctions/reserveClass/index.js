const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId, scheduleId, action, cardType } = event

  // 1. 获取用户（people）信息
  const userRes = await db.collection('people').doc(studentId).get()
  const user = userRes.data
  if (!user) return { success: false, msg: '用户不存在' }

  // 2. 检查卡类型和次数
  if (action === "reserve") {
    if ((cardType === "次卡" || cardType === "私教卡") && user.times <= 0) {
      return { success: false, msg: '卡次数不足' }
    }
    if (user.expireDate && user.expireDate < new Date()) {
      return { success: false, msg: '卡已过期' }
    }

    // 3. 扣除次数并写入预约
    const transaction = await db.runTransaction(async (transaction) => {
      if (cardType === "次卡" || cardType === "私教卡") {
        await transaction.collection('people').doc(studentId).update({
          data: { times: db.command.inc(-1) }
        })
      }
      await transaction.collection('booking').add({
        data: {
          studentId,
          scheduleId,
          cardType,
          createTime: db.serverDate(),
          status: 1 // 已预约
        }
      })
      return { success: true }
    })
    return transaction
  } else if (action === "cancel") {
    // 取消预约返还次数
    if (cardType === "次卡" || cardType === "私教卡") {
      await db.collection('people').doc(studentId).update({
        data: { times: db.command.inc(1) }
      })
    }
    await db.collection('booking').where({ studentId, scheduleId }).remove()
    return { success: true }
  }
}