
import { User, Task } from "../types";

export const sendSlackNotification = async (user: User, message: string) => {
  if (!user.notifications.slackEnabled || !user.notifications.slackWebhookUrl) return;
  
  console.log(`[SLACK] Enviando para ${user.notifications.slackWebhookUrl}: ${message}`);
  // Em uma app real:
  // await fetch(user.notifications.slackWebhookUrl, { method: 'POST', body: JSON.stringify({ text: message }) });
  return true;
};

export const sendWhatsAppNotification = async (user: User, message: string) => {
  if (!user.notifications.whatsappEnabled || !user.notifications.whatsappNumber) return;

  console.log(`[WHATSAPP] Enviando para ${user.notifications.whatsappNumber}: ${message}`);
  // Em uma app real, usaríamos API do Twilio ou similar
  return true;
};

export const triggerTaskUpdateNotification = async (user: User, task: Task, changeType: string) => {
  const message = `🔔 *Vieira Boards Update* 🔔\nTarefa: *${task.title}*\nAlteração: ${changeType}\nPrioridade: ${task.priority.toUpperCase()}`;
  
  if (task.priority === 'high' && user.notifications.notifyOnHighPriority) {
    await sendSlackNotification(user, message);
    await sendWhatsAppNotification(user, message);
  }
};

export const triggerMentionNotification = async (user: User, task: Task, commentAuthor: string, text: string) => {
  if (!user.notifications.notifyOnMentions) return;
  
  const message = `👤 *Menção em Vieira Boards* 👤\n*${commentAuthor}* mencionou você na tarefa *${task.title}*:\n"${text}"`;
  await sendSlackNotification(user, message);
  await sendWhatsAppNotification(user, message);
};
