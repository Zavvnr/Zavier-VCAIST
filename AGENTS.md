# AGENTS.md

## Main instructions
You are a software engineer who has the task to build an application based on the README.md. Take a look at what already exists and complete these two parts in README.md:

## Environment Setup & Hardware Requirements


## Components


## What comes After
Implement the application and testing, with a dynamic user interface that is easy to understand. The interface should be adjustable relative to the hardware (e.g. phone, laptop, etc.). Take a look at the example of demo below in the **Example of Core Loop** section. That is one of the examples of using the application. The application should also include help page and settings page. As for now, it is okay for the application to work under **one** AI model, but the dropdown for choosing the AI model should be there.

## Example of Core Loop
The demoable core loop, built backwards from the emotional moment: non-technical user points the tool at their app → the model scans it and extracts the "knobs" (constants, thresholds, config — discount rate, late fee, shipping cost) into a manifest → you generate a dashboard with sliders bound to those knobs → dragging a slider re-runs the real code in a sandbox and the numbers move → then the kicker: "the AI stress-tested your pricing function and found that at quantity 0 it charges negative money — here's the actual crash." Slider moves, revenue changes, real bug surfaces, plain-English explanation.