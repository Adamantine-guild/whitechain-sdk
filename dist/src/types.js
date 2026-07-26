export class GrantChainError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GrantChainError';
    }
}
export const TODO = {
    voting: 'TODO: voting support',
    delegation: 'TODO: delegation support',
    analytics: 'TODO: analytics queries',
    reputation: 'TODO: reputation integration',
};
