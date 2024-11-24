import { AnalysisResult } from "src/types/results";

export class ResultFormatter {
    static formatTasks(tasks: AnalysisResult['tasks']): string {
        return tasks.map(task => {
            const priority = this.getPriorityEmoji(task.priority);
            const dueDate = task.dueDate ? ` 📅 ${task.dueDate}` : '';
            const source = task.source ? ` 📎 [[${task.source}]]` : '';
            return `- [ ] ${priority} ${task.title}${dueDate}${source}`;
        }).join('\n');
    }

    private static getPriorityEmoji(priority: string): string {
        const emojis = {
            high: '🔴',
            medium: '🟡',
            low: '🟢'
        };
        return emojis[priority as keyof typeof emojis] || '⚪';
    }

    static formatCost(cost: number): string {
        return `$${cost.toFixed(4)}`;
    }

    static formatDate(): string {
        return window.moment().format('YYYY-MM-DD');
    }

    static formatTaskHeader(date: string): string {
        return `## Generated Tasks (${date})\n\n`;
    }
}
