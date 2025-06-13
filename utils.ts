// utils.ts
export function debounced<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    let timeout: NodeJS.Timeout | null;
    let currentResolve: ((value: Awaited<ReturnType<T>>) => void) | null;
    let currentReject: ((reason?: any) => void) | null;

    return function(this: ThisParameterType<T>, ...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
        return new Promise((resolve, reject) => {
            currentResolve = resolve;
            currentReject = reject;

            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(async () => {
                timeout = null;
                try {
                    const result = await func.apply(this, args);
                    if (currentResolve) {
                        currentResolve(result);
                    }
                } catch (error) {
                    if (currentReject) {
                        currentReject(error);
                    }
                } finally {
                    currentResolve = null;
                    currentReject = null;
                }
            }, delay);
        });
    };
}
