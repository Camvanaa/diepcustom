import Barrel from "../Barrel";
import Bullet from "./Bullet";
import { AI, AIState } from "../../AI";
import Drone from "./Drone";
import { Entity } from "../../../Native/Entity";

import { InputFlags, PhysicsFlags, StyleFlags } from "../../../Const/Enums";
import { BarrelDefinition, TankDefinition } from "../../../Const/TankDefinitions";
import { Inputs } from "../../AI";
import { BarrelBase } from "../TankBody";
import { CameraEntity } from "../../../Native/Camera";
import TankDefinitions from "../../../Const/TankDefinitions.json";

/**
 * 代表游戏中的坦克形子弹
 */
export default class TankProjectile extends Bullet implements BarrelBase {
    /** 默认旋转速度 */
    public static BASE_ROTATION = 0.1;

    /** 坦克的炮管 */
    private tankBarrels: Barrel[];

    /** 相机实体（用于队伍） */
    public cameraEntity: CameraEntity;
    /** 炮管的装填时间 */
    public reloadTime = 15;
    /** 射击输入控制 */
    public inputs: Inputs;
    /** 每tick的旋转角度 */
    private rotationPerTick = TankProjectile.BASE_ROTATION;

    /** AI控制器 */
    public ai: AI;
    /** 是否可以控制无人机 */
    public canControlDrones: boolean;
    /** 无人机是否在休息状态 */
    private restCycle = true;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number, direction: number, isDroneMode: boolean = false) {
        super(barrel, tank, tankDefinition, shootAngle);
        this.ai = new AI(this);
        console.log("Creating TankProjectile with definition:", tankDefinition);
        
        this.rotationPerTick = direction;
        this.cameraEntity = tank.cameraEntity;
        this.tankBarrels = [];
        this.canControlDrones = true;

        const bulletDefinition = barrel.definition.bullet;

        this.usePosAngle = true;

        if (tankDefinition && tankDefinition.barrels) {
            for (const barrelDefinition of tankDefinition.barrels) {
                const newBarrel = new Barrel(this, {
                    ...barrelDefinition,
                });
                newBarrel.styleData.values.color = this.styleData.values.color;
                this.tankBarrels.push(newBarrel);
            }
            console.log("Created", this.tankBarrels.length, "barrels");
        }

        this.inputs = new Inputs();
        this.inputs.flags |= InputFlags.leftclick;

        if (isDroneMode) {
            this.ai = new AI(this);
            this.ai.viewRange = 850 * tank.sizeFactor;
            this.ai.targetFilter = (targetPos) => (targetPos.x - this.tank.positionData.values.x) ** 2 + (targetPos.y - this.tank.positionData.values.y) ** 2 <= this.ai.viewRange ** 2; // (1000 ** 2) 1000 radius
            this.physicsData.values.sides = bulletDefinition.sides ?? 3;
            if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
            this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
            this.physicsData.values.flags ^= PhysicsFlags.canEscapeArena;
            this.styleData.values.flags &= ~StyleFlags.hasNoDmgIndicator;

            if (barrel.definition.bullet.lifeLength !== -1) {
                this.lifeLength = 88 * barrel.definition.bullet.lifeLength;
            } else {
                this.lifeLength = Infinity;
            }
            this.deathAccelFactor = 1;

            this.physicsData.values.pushFactor = 4;
            this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;

            this.baseSpeed /= 3;

            barrel.droneCount += 1;

            this.ai.movementSpeed = this.ai.aimSpeed = this.baseAccel;
        }
    }

    public get sizeFactor() {
        return this.physicsData.values.size / 50;
    }

    /** This allows for factory to hook in before the entity moves. */
    protected tickMixin(tick: number) {
        super.tick(tick);
    }

    public tick(tick: number) {
        const usingAI = !this.canControlDrones || this.tank.inputs.deleted || (!this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel());
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        if (usingAI && this.ai.state === AIState.idle) {
            const delta = {
                x: this.positionData.values.x - this.tank.positionData.values.x,
                y: this.positionData.values.y - this.tank.positionData.values.y
            }
            const base = this.baseAccel;

            // still a bit inaccurate, works though
            let unitDist = (delta.x ** 2 + delta.y ** 2) / Drone.MAX_RESTING_RADIUS;
            if (unitDist <= 1 && this.restCycle) {
                this.baseAccel /= 6;
                this.positionData.angle += 0.01 + 0.012 * unitDist;
            } else {
                const offset = Math.atan2(delta.y, delta.x) + Math.PI / 2
                delta.x = this.tank.positionData.values.x + Math.cos(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.x;
                delta.y = this.tank.positionData.values.y + Math.sin(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.y;
                this.positionData.angle = Math.atan2(delta.y, delta.x);
                if (unitDist < 0.5) this.baseAccel /= 3;
                this.restCycle = (delta.x ** 2 + delta.y ** 2) <= 4 * (this.tank.physicsData.values.size ** 2);
            }

            if (!Entity.exists(this.barrelEntity)) this.destroy();

            this.tickMixin(tick);

            this.baseAccel = base;

            return;
        } else {
            this.positionData.angle = Math.atan2(inputs.mouse.y - this.positionData.values.y, inputs.mouse.x - this.positionData.values.x);
            this.restCycle = false
        }


        
        if (this.canControlDrones && inputs.attemptingRepel()) {
            this.positionData.angle += Math.PI; 
        }

        // So that switch tank works, as well as on death
        if (!Entity.exists(this.barrelEntity)) this.destroy();

        this.tickMixin(tick);
    }
} 