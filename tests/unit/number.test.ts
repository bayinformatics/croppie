import { describe, expect, test } from "bun:test";
import { toNumber } from "../../src/utils/number.ts";

describe("toNumber", () => {
	test("passes numbers through", () => {
		expect(toNumber(1.5)).toBe(1.5);
		expect(toNumber(0)).toBe(0);
		expect(toNumber(Number.NaN)).toBeNaN();
	});

	test("converts numeric strings", () => {
		expect(toNumber("1.5")).toBe(1.5);
		expect(toNumber(" 200 ")).toBe(200);
		expect(toNumber("0")).toBe(0);
	});

	test("turns blank strings into NaN, not 0", () => {
		expect(toNumber("")).toBeNaN();
		expect(toNumber(" ")).toBeNaN();
		expect(toNumber("\t\n")).toBeNaN();
	});

	test("turns strings that are not numbers into NaN", () => {
		expect(toNumber("abc")).toBeNaN();
		expect(toNumber("1.5x")).toBeNaN();
	});
});
