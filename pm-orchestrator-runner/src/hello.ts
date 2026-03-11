/**
 * FizzBuzz implementation.
 * Returns "Fizz" for multiples of 3, "Buzz" for multiples of 5,
 * "FizzBuzz" for multiples of both, or the number as a string.
 */
export function fizzBuzz(n: number): string {
  if (n % 15 === 0) return 'FizzBuzz';
  if (n % 3 === 0) return 'Fizz';
  if (n % 5 === 0) return 'Buzz';
  return String(n);
}

/**
 * Generate FizzBuzz sequence from 1 to n.
 */
export function fizzBuzzSequence(n: number): string[] {
  const result: string[] = [];
  for (let i = 1; i <= n; i++) {
    result.push(fizzBuzz(i));
  }
  return result;
}
