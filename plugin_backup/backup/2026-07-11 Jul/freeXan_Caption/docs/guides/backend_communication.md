# Understanding the "Brain" of SubMachine: How the Plugin Talks to Premiere

To help non-technical users and stakeholders understand how SubMachine works, we use the **"Dashboard and Engine"** metaphor.

## The Dashboard (The Plugin UI)
The panel you see inside Premiere Pro is like the **dashboard of a modern car**. It has buttons, sliders, and text boxes. When you interact with it, you aren't actually touching the car's engine; you are just sending signals.

## The Engine Room (The Backend / ExtendScript)
The "Engine Room" is where the heavy lifting happens. It lives deep inside Premiere Pro. This is where the code that can actually move clips, change colors, and edit text resides.

## The Communication Chain: "The Order of Operations"
Whenever you perform an action (like clicking **Split**), the following sequence happens:

1.  **The Message**: The Dashboard sends a digital "Order Form" to the Engine Room.
2.  **The Project Manager**: A "Main Script" receives the order. It doesn't do all the work itself; instead, it coordinates several specialized "workers" (Functions).
3.  **The Workers (Functions)**:
    *   **The Inspector**: Checks if you have a sequence open.
    *   **The Analyst**: Looks at your timeline to see which words belong together.
    *   **The Surgeon**: Performs the actual split or join on the clips.
    *   **The Artist**: Re-applies the colors and styles to make sure everything looks perfect.
4.  **The Completion**: Once the last worker is done, the Project Manager sends a "Job Complete" receipt back to the Dashboard.

## Why "One After Another"?
SubMachine performs these tasks **sequentially** (one by one). This is critical because:
*   **It prevents mistakes**: The "Artist" won't try to paint a clip before the "Surgeon" has finished moving it.
*   **Undo Safety**: Because the steps are organized, the plugin can tell Premiere Pro to "Group" all these actions into a single **Undo** step. If you don't like the result, one `Ctrl+Z` reverses the entire chain.

---

### Glossary for Non-Coders
*   **Frontend**: The visual part of the plugin you click on.
*   **Backend**: The hidden scripts that control Premiere Pro.
*   **Function**: A specific set of instructions to perform one small task (like "Find the color of this clip").
*   **Synchronous**: Doing things in a specific order, one at a time, until the job is finished.
