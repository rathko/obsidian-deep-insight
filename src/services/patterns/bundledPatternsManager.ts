import { BUNDLED_PATTERNS } from '../patterns/patterns-bundle';

export class BundledPatternsManager {
    static getBundledPatterns(): Map<string, string> {
        const patterns = new Map<string, string>();
        
        for (const [name, content] of Object.entries(BUNDLED_PATTERNS)) {
            if (content.system) {
                patterns.set(`${name}/system.md`, content.system);
            }
            if (content.user) {
                patterns.set(`${name}/user.md`, content.user);
            }
        }
        
        return patterns;
    }
}