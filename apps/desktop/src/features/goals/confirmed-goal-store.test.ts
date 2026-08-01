import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalSchema } from "@continuity/contracts";
import {
  clearConfirmedGoal,
  getConfirmedGoalSnapshot,
  setConfirmedGoal,
  subscribeConfirmedGoal,
} from "./confirmed-goal-store";

const first = GoalSchema.parse({
  goalId: "goal-1", title: "Write report", path: ["Project", "Report"],
  status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.9,
});
const second = GoalSchema.parse({
  goalId: "goal-2", title: "Review references", path: ["Project", "References"],
  status: "IN_PROGRESS", source: "USER_CONFIRMED", confidence: 0.85,
});

afterEach(() => clearConfirmedGoal());

describe("confirmed Goal store", () => {
  it("is initially empty and supports set, replace, and clear", () => {
    expect(getConfirmedGoalSnapshot()).toEqual({});
    setConfirmedGoal(first);
    expect(getConfirmedGoalSnapshot().confirmedGoal).toEqual(first);
    setConfirmedGoal(second);
    expect(getConfirmedGoalSnapshot().confirmedGoal).toEqual(second);
    clearConfirmedGoal();
    expect(getConfirmedGoalSnapshot()).toEqual({});
  });

  it("notifies subscribed non-React consumers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConfirmedGoal(listener);
    setConfirmedGoal(first);
    clearConfirmedGoal();
    unsubscribe();
    setConfirmedGoal(second);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
