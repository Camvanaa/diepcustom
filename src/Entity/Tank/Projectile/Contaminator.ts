import Barrel from "../Barrel";
import Drone from "./Drone";

import { InputFlags, PhysicsFlags } from "../../../Const/Enums";
import { BarrelDefinition, TankDefinition } from "../../../Const/TankDefinitions";
import { AIState, Inputs } from "../../AI";
import { BarrelBase } from "../TankBody";
import { CameraEntity } from "../../../Native/Camera";

/**
 * Barrel definition for the factory minion's barrel.
 */
 const MinionBarrelDefinition: BarrelDefinition = {
    angle: 0,
    offset: 0,
    size: 80,
    width: 50.4,
    delay: 0,
    reload: 0.25,
    recoil: 0.5,
    isTrapezoid: true,
    trapezoidDirection: 0,
    addon: null,
    bullet: {
        type: "poison",
        health: 2,
        damage: 0.01,
        speed: 1,
        scatterRate: 1,
        lifeLength: 0.17,
        sizeRatio: 1,
        absorbtionFactor: 1,
        poisonDamage: 0.00075,
        poisonDuration: 2
    }
};

/**
 * The drone class represents the minion (projectile) entity in diep.
 */
export default class Minion extends Drone implements BarrelBase {
    /** Size of the focus the minions orbit. */
    public static FOCUS_RADIUS = 500 ** 2;

    /** The minion's barrel */
    private minionBarrel: Barrel;

    /** The camera entity (used as team) of the minion. */
    public cameraEntity: CameraEntity;
    /** The reload time of the minion's barrel. */
    public reloadTime = 1;
    /** The inputs for when to shoot or not. */
    public inputs = new Inputs();

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);

        const bulletDefinition = barrel.definition.bullet;

        this.inputs = this.ai.inputs;
        this.ai.viewRange = 900;
        this.usePosAngle = false;

        this.physicsData.values.sides = 4;
        this.physicsData.values.size *= 1.2;
        
        if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
        if (this.physicsData.values.flags & PhysicsFlags.canEscapeArena) this.physicsData.values.flags ^= PhysicsFlags.canEscapeArena;

        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;

        this.cameraEntity = tank.cameraEntity;

        this.minionBarrel = new Barrel(this, MinionBarrelDefinition);
        this.ai.movementSpeed = this.ai.aimSpeed = this.baseAccel;
    }

    public get sizeFactor() {
        return this.physicsData.values.size / 50;
    }

    /** This allows for factory to hook in before the entity moves. */
    protected tickMixin(tick: number) {
        this.reloadTime = this.tank.reloadTime;

        const usingAI = !this.canControlDrones || !this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel();
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        if (usingAI && this.ai.state === AIState.idle) {
            this.movementAngle = this.positionData.values.angle;
        } else {
            this.inputs.flags |= InputFlags.leftclick;

            const dist = inputs.mouse.distanceToSQ(this.positionData.values);

            if (dist < Minion.FOCUS_RADIUS / 4) { // Half
                this.movementAngle = this.positionData.values.angle + Math.PI;
            } else if (dist < Minion.FOCUS_RADIUS) {
                this.movementAngle = this.positionData.values.angle + Math.PI / 2;
            } else this.movementAngle = this.positionData.values.angle;
        }

        super.tickMixin(tick);
    }
}
