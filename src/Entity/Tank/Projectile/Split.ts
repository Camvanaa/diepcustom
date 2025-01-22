/*
    DiepCustom - custom tank game server that shares diep.io's WebSocket protocol
    Copyright (C) 2022 ABCxFF (github.com/ABCxFF)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>
*/
import TankBody from "../TankBody";
import Bullet from "./Bullet";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { AI, AIState, Inputs } from "../../AI";
import { AddonById } from "../Addons";
const { cell: CellAddon } = AddonById;
import { CameraEntity } from "../../../Native/Camera";
import { InputFlags, PhysicsFlags, Stat } from "../../../Const/Enums";
import { Entity } from "../../../Native/Entity";
import LivingEntity from "../../Live";
/**
 * 分裂子弹类，继承自普通子弹
 */
export default class Split extends Bullet implements BarrelBase {
    /** 分裂次数计数 */
    protected splitCount: number = 0;
    /** 最大分裂次数 */
    protected maxSplitCount: number;
    /** 每次分裂的子弹数量 */
    protected splitBulletCount: number;
    /** 分裂角度 */
    protected splitAngle: number;
    /** AI控制器 */
    public ai: AI;
    /** 相机实体 */
    public cameraEntity: CameraEntity;
    /** 射击输入控制 */
    public inputs = new Inputs();
    /** 休息状态 */
    private restCycle = true;
    /** 最大休息半径 */
    public static MAX_RESTING_RADIUS = 400 ** 2;
    /** 是否可以控制 */
    protected canControlDrones: boolean = false;
    public reloadTime = 1;
    
    public get sizeFactor() {
        return this.physicsData.values.size / 50;
    }

    public constructor(
        barrel: Barrel,
        tank: BarrelBase,
        tankDefinition: TankDefinition | null,
        shootAngle: number,
        splitParams: {
            maxSplitCount?: number;
            splitBulletCount?: number;
            splitAngle?: number;
            sizeRatio?: number;
            isChild?: boolean;  // 添加标记，表示是否为分裂产生的子弹
        } = {}
    ) {
        super(barrel, tank, tankDefinition, shootAngle);

        // 获取正确的坦克实体
        const tankEntity = tank.cameraEntity.cameraData.player as LivingEntity;
        
        // 继承坦克的属性
        this.healthData.values.maxHealth = tankEntity.healthData.values.maxHealth;
        this.healthData.values.health = tankEntity.healthData.values.maxHealth;
        
        
        const bodyDamageLevel = tank.cameraEntity.cameraData.statLevels.values[Stat.BodyDamage];
        this.damagePerTick = bodyDamageLevel * 6 + 20;  // 与 TankBody 中的伤害计算相同
        
        this.baseAccel = tank.cameraEntity.cameraData.values.movementSpeed;
        this.physicsData.values.pushFactor = 4;

        this.healthData.values.maxHealth = this.healthData.values.maxHealth * 0.3;
        this.healthData.values.health = this.healthData.values.maxHealth * 0.3;
        this.damagePerTick = this.damagePerTick * 0.3;
        this.baseAccel = this.baseAccel * 10;

        //console.log('Tank Health:', this.healthData.values.health);  // 调试用
        //console.log('Tank Damage:', this.damagePerTick);  // 调试用
        //console.log('Tank Speed:', this.baseSpeed);  // 调试用

        // 从 barrel definition 或默认值获取分裂参数
        this.maxSplitCount = splitParams.maxSplitCount ?? 2;
        this.splitBulletCount = splitParams.splitBulletCount ?? 2;
        this.splitAngle = splitParams.splitAngle ?? (Math.PI / 6);

        // 添加 Cell addon
        if (CellAddon) new CellAddon(this);

        // 设置 AI
        this.ai = new AI(this);
        this.ai.viewRange = 1250 * tank.sizeFactor;
        this.ai.targetFilter = (targetPos) => {
            const entities = this.game.entities.collisionManager.retrieve(targetPos.x, targetPos.y, 1, 1);
            for (let i = 0; i < entities.length; ++i) {
                if (entities[i].positionData.values === targetPos && entities[i] instanceof TankBody) {
                    return true;
                }
            }
            return false;
        };
        this.usePosAngle = true;
        this.cameraEntity = tank.cameraEntity;

        // 设置物理属性
        this.physicsData.values.sides = 1;
        // 移除noOwnTeamCollision标志（如果存在）
        if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) {
            this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
        }
        // 设置onlySameOwnerCollision标志
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
        this.physicsData.values.flags ^= PhysicsFlags.canEscapeArena;

        // 设置生命周期
        if (barrel.definition.bullet.lifeLength !== -1) {
            this.lifeLength = 88 * barrel.definition.bullet.lifeLength;
        } else {
            this.lifeLength = Infinity;  // 设置为无限生命周期
        }

        // 只有非子弹才增加 droneCount
        if (!splitParams.isChild) {
            barrel.droneCount += 1;
            //console.log('barrel.droneCount:', barrel.droneCount);
        }

    }

    /** 销毁时减少 droneCount */
    public destroy(animate = true) {
        /*console.log('Destroy called:', {
            animate: animate,
            splitCount: this.splitCount,
            maxSplitCount: this.maxSplitCount,
            droneCount: this.barrelEntity.droneCount
        });*/

        if (animate && this.splitCount < this.maxSplitCount) {
            this.createSplitBullets();
            super.destroy(false);
            // 只在最后一次分裂后减少 droneCount
            if (this.splitCount === 0) {
                this.barrelEntity.droneCount -= 1;
            }
        } else {
            super.destroy(animate);
        }
    }

    protected createSplitBullets(): void {
        // 确保所需的组件都存在
        if (!this.barrelEntity || !this.tank) return;

        // 获取 root tank 的属性
        const tankEntity = this.tank.cameraEntity.cameraData.player as LivingEntity;
        
        // 获取当前子弹的位置和角度
        const currentAngle = this.positionData.values.angle;
        
        // 获取大小衰减比例，默认为 0.8
        const sizeRatio = this.barrelEntity.definition.bullet.splitParams?.sizeRatio ?? 0.8;
        
        // 创建新的分裂子弹
        for (let i = 0; i < this.splitBulletCount; i++) {
            const angleOffset = (i - Math.floor(this.splitBulletCount / 2)) * this.splitAngle;
            const newAngle = currentAngle + angleOffset;

            // 在创建分裂子弹之前，先记录当前的 splitCount
            const currentSplitCount = this.splitCount;

            const splitBullet = new Split(
                this.barrelEntity,
                this.tank,
                this.tankDefinition,
                newAngle,
                {
                    maxSplitCount: this.maxSplitCount,
                    splitBulletCount: this.splitBulletCount,
                    splitAngle: this.splitAngle,
                    sizeRatio: sizeRatio,
                    isChild: true  // 标记为子弹
                }
            );

            // 手动设置 splitCount，避免触发构造函数中的 droneCount 增加
            splitBullet.splitCount = currentSplitCount + 1;

            // 继承 root tank 的属性
            splitBullet.healthData.values.maxHealth = tankEntity.healthData.values.maxHealth * 0.3;
            splitBullet.healthData.values.health = splitBullet.healthData.values.maxHealth * 0.3;
            splitBullet.damagePerTick = (this.tank.cameraEntity.cameraData.statLevels.values[Stat.BodyDamage] * 6 + 20) * 0.3;
            splitBullet.baseAccel = this.tank.cameraEntity.cameraData.values.movementSpeed * 10;

            
            // 继承分裂次数
            splitBullet.healthData.values.maxHealth *= sizeRatio ** splitBullet.splitCount;
            splitBullet.healthData.values.health *= sizeRatio ** splitBullet.splitCount;
            splitBullet.damagePerTick *= sizeRatio ** splitBullet.splitCount;
            splitBullet.baseAccel *= 0.9 ** splitBullet.splitCount;
            // 设置新子弹的位置（添加随机偏移）
            const randomOffset = 250; // 偏移范围
            splitBullet.positionData.values.x = this.positionData.values.x + (Math.random() - 0.5) * randomOffset;
            splitBullet.positionData.values.y = this.positionData.values.y + (Math.random() - 0.5) * randomOffset;
            splitBullet.physicsData.size = this.physicsData.size * sizeRatio;

            const randomAngle = newAngle;
            splitBullet.baseSpeed = 50;
            splitBullet.velocity.x = Math.cos(randomAngle) * 50;
            splitBullet.velocity.y = Math.sin(randomAngle) * 50;
            
        }
    }

    /** This allows for factory to hook in before the entity moves. */
    protected tickMixin(tick: number) {
        super.tick(tick);
    }

    public tick(tick: number) {
        this.reloadTime = this.tank.reloadTime;
        const usingAI = !this.canControlDrones || this.tank.inputs.deleted || (!this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel());
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        // not fully accurate
        if (tick - this.spawnTick >= this.tank.reloadTime) this.inputs.flags |= InputFlags.leftclick;
        
        if (usingAI && this.ai.state === AIState.idle) {
            const delta = {
                x: this.positionData.values.x - this.tank.positionData.values.x,
                y: this.positionData.values.y - this.tank.positionData.values.y
            }
            const base = this.baseAccel;

            // still a bit inaccurate, works though
            let unitDist = (delta.x ** 2 + delta.y ** 2) / Split.MAX_RESTING_RADIUS;
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